import { z } from "zod";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";

import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "../../../libs/combat/constants";
import { defineHex } from "../../../libs/travel/sector";

import type { GroundEffect, UserEffect } from "../../../libs/combat/types";
import type { ReturnedUserState } from "../../../libs/combat/types";
import { availableUserActions, performAction } from "../../../libs/combat/actions";
import { applyEffects } from "../../../libs/combat/tags";
import { calcBattleResult, maskBattle } from "../../../libs/combat/util";
import { getServerPusher } from "../../../libs/pusher";
import { updateUser, updateBattle, createAction } from "../../../libs/combat/database";

import deepDiff from "deep-diff";

export const combatRouter = createTRPCRouter({
  // Get battle and any users in the battle
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

      // Hide private state of non-session user
      const newMaskedBattle = maskBattle(battle, ctx.userId);

      // Calculate if the battle is over for this user, and if so update user DB
      const { result } = calcBattleResult(newMaskedBattle.usersState, ctx.userId);

      // Delete the battle if it's done
      if (result) {
        await updateUser(result, ctx.userId, ctx.prisma);
      }

      // Return the new battle + result state if applicable
      return { battle: newMaskedBattle, result: result };
    }),
  // Get history
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
  // Battle action
  performAction: protectedProcedure
    .input(
      z.object({
        battleId: z.string().cuid(),
        userId: z.string(),
        actionId: z.string(),
        longitude: z.number(),
        latitude: z.number(),
        version: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch battle
      const battle = await ctx.prisma.battle.findUniqueOrThrow({
        where: { id: input.battleId },
      });

      // Get valid actions
      const usersState = battle.usersState as unknown as ReturnedUserState[];
      const usersEffects = battle.usersEffects as unknown as UserEffect[];
      const groundEffects = battle.groundEffects as unknown as GroundEffect[];
      const actions = availableUserActions(usersState, ctx.userId);
      const action = actions.find((a) => a.id === input.actionId);
      if (!action) throw serverError("PRECONDITION_FAILED", "Invalid action");

      // Create the grid for the battle
      const Tile = defineHex({ dimensions: 1, orientation: Orientation.FLAT });
      const grid = new Grid(
        Tile,
        rectangle({ width: COMBAT_WIDTH, height: COMBAT_HEIGHT })
      ).map((tile) => {
        tile.cost = 1;
        return tile;
      });

      // Ensure that the userId we're trying to move is valid
      const user = usersState.find(
        (u) => u.controllerId === ctx.userId && u.userId === input.userId
      );
      if (!user) throw serverError("PRECONDITION_FAILED", "This is not your user");

      // Perform action, get latest status effects
      // Note: this mutates usersEffects, groundEffects
      const check = performAction({
        usersState,
        usersEffects,
        groundEffects,
        grid,
        action,
        userId: input.userId,
        longitude: input.longitude,
        latitude: input.latitude,
      });
      if (!check) {
        throw serverError(
          "PRECONDITION_FAILED",
          "Action not possible, did your opponent already move?"
        );
      }

      // Apply relevant effects, and get back new state + active effects
      const { newUsersState, newUsersEffects, newGroundEffects, actionEffects } =
        applyEffects(usersState, usersEffects, groundEffects);

      // Calculate if the battle is over for this user, and if so update user DB
      const { finalUsersState, result } = calcBattleResult(newUsersState, ctx.userId);

      /**
       * DATABASE UPDATES
       */
      const newBattle = await ctx.prisma.$transaction(async (tx) => {
        const [newBattle] = await Promise.all([
          updateBattle(
            result,
            battle,
            finalUsersState,
            newUsersEffects,
            newGroundEffects,
            tx
          ),
          createAction(action, battle, actionEffects, tx),
          updateUser(result, ctx.userId, tx),
        ]);
        return newBattle;
      });

      // Return the new battle + results state if applicable
      const newMaskedBattle = maskBattle(newBattle, ctx.userId);

      // Update over websockets
      const pusher = getServerPusher();
      const privateBattle = maskBattle(newBattle, "no_id");
      void pusher.trigger(battle.id, "event", privateBattle);

      // Return masked battle
      return { battle: newMaskedBattle, result: result };
    }),
});
