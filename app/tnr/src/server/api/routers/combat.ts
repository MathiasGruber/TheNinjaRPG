import { z } from "zod";
import type { Prisma, Battle } from "@prisma/client";
import { UserStatus } from "@prisma/client";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";

import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "../../../libs/combat/constants";
import { VILLAGE_LONG, VILLAGE_LAT } from "../../../libs/travel/constants";
import { defineHex } from "../../../libs/travel/sector";

import type { GroundEffect, UserEffect } from "../../../libs/combat/types";
import type { ReturnedUserState } from "../../../libs/combat/types";
import { availableUserActions, performAction } from "../../../libs/combat/actions";
import { applyEffects } from "../../../libs/combat/tags";
import { calcBattleResult, maskBattle } from "../../../libs/combat/util";

export const combatRouter = createTRPCRouter({
  // Get battle and any users in the battle
  getBattle: protectedProcedure
    .input(z.object({ battleId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      // Distinguish between public and non-public user state
      const battle = await ctx.prisma.battle.findUniqueOrThrow({
        where: { id: input.battleId },
      });
      // Hide private state of non-session user
      const newMaskedBattle = maskBattle(battle, ctx.userId);

      // Calculate if the battle is over for this user, and if so update user DB
      const results = calcBattleResult(newMaskedBattle.usersState, ctx.userId);

      // Delete the battle if it's done
      const battleOver = results?.friendsLeft === 1 && results?.targetsLeft === 0;
      if (battleOver) {
        void (await ctx.prisma.battle.delete({
          where: { id: input.battleId },
        }));
      }

      // Return the new battle + result state if applicable
      return { battle: newMaskedBattle, results: results };
    }),
  // Battle action
  performAction: protectedProcedure
    .input(
      z.object({
        battleId: z.string().cuid(),
        actionId: z.string(),
        longitude: z.number(),
        latitude: z.number(),
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

      // Perform action, get latest status effects
      const check = performAction({
        usersState,
        usersEffects,
        groundEffects,
        grid,
        action,
        userId: ctx.userId,
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
      const { newUsersState, newUsersEffects, newGroundEffects } = applyEffects(
        usersState,
        usersEffects,
        groundEffects
      );

      // Calculate if the battle is over for this user, and if so update user DB
      const results = calcBattleResult(newUsersState, ctx.userId);

      // Apply battle result to user
      if (results) {
        void (await ctx.prisma.userData.update({
          where: { userId: ctx.userId },
          data: {
            experience: { increment: results.experience },
            //elo_pve: { increment: results.elo_pve },
            //elo_pvp: { increment: results.elo_pvp },
            cur_health: results.cur_health,
            cur_stamina: results.cur_stamina,
            cur_chakra: results.cur_chakra,
            strength: { increment: results.strength },
            intelligence: { increment: results.intelligence },
            willpower: { increment: results.willpower },
            speed: { increment: results.speed },
            ninjutsu_offence: { increment: results.ninjutsu_offence },
            genjutsu_offence: { increment: results.genjutsu_offence },
            taijutsu_offence: { increment: results.taijutsu_offence },
            bukijutsu_offence: { increment: results.bukijutsu_offence },
            ninjutsu_defence: { increment: results.ninjutsu_defence },
            genjutsu_defence: { increment: results.genjutsu_defence },
            taijutsu_defence: { increment: results.taijutsu_defence },
            bukijutsu_defence: { increment: results.bukijutsu_defence },
            // Conditional on win/loss
            ...(results.cur_health < 0
              ? {
                  status: UserStatus.HOSPITALIZED,
                  longitude: VILLAGE_LONG,
                  latitude: VILLAGE_LAT,
                }
              : { status: UserStatus.AWAKE }),
          },
        }));
      }

      // Update the battle
      let newBattle: Battle | undefined = undefined;
      try {
        newBattle = await ctx.prisma.battle.update({
          where: { id_version: { id: input.battleId, version: battle.version } },
          data: {
            version: { increment: 1 },
            usersState: newUsersState as unknown as Prisma.JsonArray,
            usersEffects: newUsersEffects as Prisma.JsonArray,
            groundEffects: newGroundEffects as Prisma.JsonArray,
          },
        });
      } catch (e) {
        newBattle = await ctx.prisma.battle.findUniqueOrThrow({
          where: { id: input.battleId },
        });
      }

      // Delete the battle if it's done
      const battleOver = results?.friendsLeft === 1 && results?.targetsLeft === 0;
      if (battleOver) {
        void (await ctx.prisma.battle.delete({
          where: { id: input.battleId },
        }));
      }

      // Return the new battle + results state if applicable
      const newMaskedBattle = maskBattle(newBattle, ctx.userId);
      return { battle: newMaskedBattle, results: results };
    }),
});
