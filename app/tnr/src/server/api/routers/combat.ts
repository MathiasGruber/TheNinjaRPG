import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "../../../libs/combat/constants";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { defineHex } from "../../../libs/hexgrid";
import { calcBattleResult, maskBattle } from "../../../libs/combat/util";
import { getServerPusher } from "../../../libs/pusher";
import { updateUser, updateBattle, createAction } from "../../../libs/combat/database";
import { BattleType } from "@prisma/client";
import { ais } from "../../../../prisma/seeds/ai";
import { fetchUser } from "./profile";
import { performAction } from "../../../libs/combat/util";
import { performAIaction } from "../../../libs/combat/ai_v1";
import { initiateBattle } from "../../../libs/combat/util";
import { performActionSchema } from "../../../libs/combat/types";
import { availableUserActions } from "../../../libs/combat/actions";
import type { BattleUserState } from "../../../libs/combat/types";
import type { UserEffect, GroundEffect } from "../../../libs/combat/types";
import type { ActionEffect, CombatAction } from "../../../libs/combat/types";

export const combatRouter = createTRPCRouter({
  getBattle: protectedProcedure
    .input(z.object({ battleId: z.string().cuid().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      // No battle ID
      if (!input.battleId) {
        return { battle: null, result: null };
      }

      // Distinguish between public and non-public user state
      const battle = await ctx.prisma.battle.findUniqueOrThrow({
        where: { id: input.battleId },
      });

      // Calculate if the battle is over for this user, and if so update user DB
      const { result } = calcBattleResult(
        battle.usersState as unknown as BattleUserState[],
        ctx.userId
      );

      // Hide private state of non-session user
      const newMaskedBattle = maskBattle(battle, ctx.userId);

      // Delete the battle if it's done
      if (result) {
        await updateUser(result, ctx.userId, ctx.prisma);
      }

      // Return the new battle + result state if applicable
      return { battle: newMaskedBattle, result: result };
    }),
  getBattleEntry: protectedProcedure
    .input(
      z.object({
        battleId: z.string().cuid().optional(),
        version: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.prisma.battleAction.findMany({
        where: {
          battleId: input.battleId,
          battleVersion: input.version,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      return entries?.[0] ? entries[0] : null;
    }),
  performAction: protectedProcedure
    .input(performActionSchema)
    .mutation(async ({ ctx, input }) => {
      // Create the grid for the battle
      const Tile = defineHex({ dimensions: 1, orientation: Orientation.FLAT });
      const grid = new Grid(
        Tile,
        rectangle({ width: COMBAT_WIDTH, height: COMBAT_HEIGHT })
      ).map((tile) => {
        tile.cost = 1;
        return tile;
      });

      // Attempt to perform action untill success || error thrown
      while (true) {
        // Fetch battle
        const battle = await ctx.prisma.battle.findUniqueOrThrow({
          where: { id: input.battleId },
        });

        // Cast to correct types
        const usersState = battle.usersState as unknown as BattleUserState[];
        const usersEffects = battle.usersEffects as unknown as UserEffect[];
        const groundEffects = battle.groundEffects as unknown as GroundEffect[];
        const battleDescription: string[] = [];
        let newUsersEffects = structuredClone(usersEffects);
        let newGroundEffects = structuredClone(groundEffects);
        let newUsersState = structuredClone(usersState);
        let actionEffects: ActionEffect[] = [];

        // Optimistic update for all other users before we process request
        const pusher = getServerPusher();
        void pusher.trigger(battle.id, "event", { version: battle.version + 1 });

        // If userId, actionID, and position specified, perform user action, otherwise attempt AI action
        if (input.userId && input.longitude && input.latitude && input.actionId) {
          // Get action
          const actions = availableUserActions(usersState, ctx.userId);
          const action = actions.find((a) => a.id === input.actionId);
          if (!action) throw new Error("Invalid action");

          // Attempt to perform action
          ({ newUsersState, newUsersEffects, newGroundEffects, actionEffects } =
            performAction({
              usersState,
              usersEffects,
              groundEffects,
              grid,
              action,
              contextUserId: ctx.userId,
              actionUserId: input.userId,
              longitude: input.longitude,
              latitude: input.latitude,
            }));
          battleDescription.push(action.battleDescription);
        }

        // Attempt to perform AI action
        console.log("-----------------");
        console.time("performAIaction");
        const {
          nextUsersState,
          nextUsersEffects,
          nextGroundEffects,
          nextActionEffects,
          description,
        } = performAIaction(newUsersState, newUsersEffects, newGroundEffects, grid);
        battleDescription.push(description);
        actionEffects = actionEffects.concat(nextActionEffects);
        console.timeEnd("performAIaction");
        console.log("-----------------");

        // If no description, means no actions, just return now
        if (!battleDescription) return;

        // Calculate if the battle is over for this user, and if so update user DB
        const { finalUsersState, result } = calcBattleResult(
          nextUsersState,
          ctx.userId
        );

        /**
         * DATABASE UPDATES in parallel transaction
         */
        const newBattle = await ctx.prisma.$transaction(async (tx) => {
          const [newBattle] = await Promise.all([
            updateBattle(
              result,
              battle,
              finalUsersState,
              nextUsersEffects,
              nextGroundEffects,
              tx
            ),
            createAction(battleDescription.join(". "), battle, actionEffects, tx),
            updateUser(result, ctx.userId, tx),
          ]);
          return newBattle;
        });

        // Return the new battle + results state if applicable
        if (newBattle) {
          const newMaskedBattle = maskBattle(newBattle, ctx.userId);
          return { battle: newMaskedBattle, result: result };
        }
      }
    }),
  startArenaBattle: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.prisma, ctx.userId);
    const closestAIs = [...ais.values()].sort((a, b) => {
      return Math.abs(a.level - user.level) - Math.abs(b.level - user.level);
    });
    const selectedAI = closestAIs[0];
    if (selectedAI) {
      return await initiateBattle(
        {
          sector: user.sector,
          userId: user.userId,
          targetId: selectedAI.userId,
          prisma: ctx.prisma,
        },
        BattleType.ARENA,
        "coliseum.webp"
      );
    }
  }),
  attackUser: protectedProcedure
    .input(
      z.object({
        longitude: z
          .number()
          .int()
          .min(0)
          .max(SECTOR_WIDTH - 1),
        latitude: z
          .number()
          .int()
          .min(0)
          .max(SECTOR_HEIGHT - 1),
        sector: z.number().int(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await initiateBattle(
        {
          longitude: input.longitude,
          latitude: input.latitude,
          sector: input.sector,
          userId: ctx.userId,
          targetId: input.userId,
          prisma: ctx.prisma,
        },
        BattleType.COMBAT
      );
    }),
});
