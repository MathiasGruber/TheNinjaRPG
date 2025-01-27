import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, or, sql } from "drizzle-orm";
import { war, warFaction, warStat, warKill } from "@/drizzle/schema";
import { nanoid } from "nanoid";

export const warRouter = createTRPCRouter({
  // Get active wars for a village
  getActiveWars: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const activeWars = await ctx.db
        .select()
        .from(war)
        .where(
          and(
            or(
              eq(war.attackerVillageId, input.villageId),
              eq(war.defenderVillageId, input.villageId),
            ),
            eq(war.status, "ACTIVE"),
          ),
        );

      return activeWars;
    }),

  // Declare war on another village
  declareWar: protectedProcedure
    .input(z.object({ targetVillageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is kage
      const userVillage = await ctx.db.query.village.findFirst({
        where: eq(village.kageId, ctx.auth.userId),
      });

      if (!userVillage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only kages can declare war",
        });
      }

      // Check if village has enough tokens
      if (userVillage.tokens < 15000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough village tokens to declare war (15,000 required)",
        });
      }

      // Check if target village exists
      const targetVillage = await ctx.db.query.village.findFirst({
        where: eq(village.id, input.targetVillageId),
      });

      if (!targetVillage) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target village not found",
        });
      }

      // Check if either village is already at war
      const existingWar = await ctx.db.query.war.findFirst({
        where: and(
          or(
            eq(war.attackerVillageId, userVillage.id),
            eq(war.defenderVillageId, userVillage.id),
            eq(war.attackerVillageId, targetVillage.id),
            eq(war.defenderVillageId, targetVillage.id),
          ),
          eq(war.status, "ACTIVE"),
        ),
      });

      if (existingWar) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One of the villages is already at war",
        });
      }

      // Create war
      const warId = nanoid();
      await ctx.db.transaction(async (tx) => {
        // Deduct tokens from attacker village
        await tx
          .update(village)
          .set({ tokens: userVillage.tokens - 15000 })
          .where(eq(village.id, userVillage.id));

        // Create war record
        await tx.insert(war).values({
          id: warId,
          attackerVillageId: userVillage.id,
          defenderVillageId: targetVillage.id,
          status: "ACTIVE",
        });

        // Create war stats for both villages
        await tx.insert(warStat).values([
          {
            id: nanoid(),
            warId,
            villageId: userVillage.id,
            townHallHp: 5000,
          },
          {
            id: nanoid(),
            warId,
            villageId: targetVillage.id,
            townHallHp: 5000,
          },
        ]);
      });

      return { warId };
    }),

  // Hire a faction for war
  hireFaction: protectedProcedure
    .input(
      z.object({
        warId: z.string(),
        villageId: z.string(),
        tokenAmount: z.number().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is kage
      const userVillage = await ctx.db.query.village.findFirst({
        where: eq(village.kageId, ctx.auth.userId),
      });

      if (!userVillage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only kages can hire factions",
        });
      }

      // Check if war exists and is active
      const currentWar = await ctx.db.query.war.findFirst({
        where: and(
          eq(war.id, input.warId),
          eq(war.status, "ACTIVE"),
          or(
            eq(war.attackerVillageId, userVillage.id),
            eq(war.defenderVillageId, userVillage.id),
          ),
        ),
      });

      if (!currentWar) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "War not found or not active",
        });
      }

      // Check if village has enough tokens
      if (userVillage.tokens < input.tokenAmount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough village tokens",
        });
      }

      // Check if faction exists
      const faction = await ctx.db.query.village.findFirst({
        where: eq(village.id, input.villageId),
      });

      if (!faction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Faction not found",
        });
      }

      // Check if faction is already hired
      const existingFaction = await ctx.db.query.warFaction.findFirst({
        where: and(
          eq(warFaction.warId, input.warId),
          eq(warFaction.villageId, input.villageId),
        ),
      });

      if (existingFaction) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Faction already hired",
        });
      }

      // Hire faction
      await ctx.db.transaction(async (tx) => {
        // Deduct tokens from village
        await tx
          .update(village)
          .set({ tokens: userVillage.tokens - input.tokenAmount })
          .where(eq(village.id, userVillage.id));

        // Create faction record
        await tx.insert(warFaction).values({
          id: nanoid(),
          warId: input.warId,
          villageId: input.villageId,
          tokensPaid: input.tokenAmount,
        });
      });

      return { success: true };
    }),

  // Record a kill in war
  recordKill: protectedProcedure
    .input(
      z.object({
        warId: z.string(),
        victimId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if war exists and is active
      const currentWar = await ctx.db.query.war.findFirst({
        where: and(eq(war.id, input.warId), eq(war.status, "ACTIVE")),
      });

      if (!currentWar) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "War not found or not active",
        });
      }

      // Get killer and victim details
      const [killer, victim] = await Promise.all([
        ctx.db.query.userData.findFirst({
          where: eq(userData.userId, ctx.auth.userId),
        }),
        ctx.db.query.userData.findFirst({
          where: eq(userData.userId, input.victimId),
        }),
      ]);

      if (!killer || !victim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Killer or victim not found",
        });
      }

      // Calculate HP changes based on killer's role
      let enemyTownHallDamage = 20;
      let ownTownHallHeal = 10;

      if (killer.anbuId) {
        enemyTownHallDamage = 40;
        ownTownHallHeal = 20;
      } else if (killer.isElder) {
        enemyTownHallDamage = 50;
        ownTownHallHeal = 40;
      } else if (killer.villageId === currentWar.attackerVillageId) {
        const attackerVillage = await ctx.db.query.village.findFirst({
          where: eq(village.id, currentWar.attackerVillageId),
        });
        if (attackerVillage?.kageId === killer.userId) {
          enemyTownHallDamage = 80;
          ownTownHallHeal = 70;
        }
      } else if (killer.villageId === currentWar.defenderVillageId) {
        const defenderVillage = await ctx.db.query.village.findFirst({
          where: eq(village.id, currentWar.defenderVillageId),
        });
        if (defenderVillage?.kageId === killer.userId) {
          enemyTownHallDamage = 80;
          ownTownHallHeal = 70;
        }
      }

      // Record kill and update town hall HP
      await ctx.db.transaction(async (tx) => {
        // Record kill
        await tx.insert(warKill).values({
          id: nanoid(),
          warId: input.warId,
          killerId: killer.userId,
          victimId: victim.userId,
          killerVillageId: killer.villageId!,
          victimVillageId: victim.villageId!,
        });

        // Update town hall HP for both villages
        const [killerVillageStat, victimVillageStat] = await Promise.all([
          tx
            .select()
            .from(warStat)
            .where(
              and(
                eq(warStat.warId, input.warId),
                eq(warStat.villageId, killer.villageId!),
              ),
            ),
          tx
            .select()
            .from(warStat)
            .where(
              and(
                eq(warStat.warId, input.warId),
                eq(warStat.villageId, victim.villageId!),
              ),
            ),
        ]);

        if (killerVillageStat[0] && victimVillageStat[0]) {
          await Promise.all([
            tx
              .update(warStat)
              .set({
                townHallHp: Math.min(
                  5000,
                  killerVillageStat[0].townHallHp + ownTownHallHeal,
                ),
              })
              .where(eq(warStat.id, killerVillageStat[0].id)),
            tx
              .update(warStat)
              .set({
                townHallHp: Math.max(
                  0,
                  victimVillageStat[0].townHallHp - enemyTownHallDamage,
                ),
              })
              .where(eq(warStat.id, victimVillageStat[0].id)),
          ]);

          // Check if victim's town hall HP reached 0
          if (victimVillageStat[0].townHallHp - enemyTownHallDamage <= 0) {
            // End war with victory for killer's village
            await tx
              .update(war)
              .set({
                status:
                  killer.villageId === currentWar.attackerVillageId
                    ? "ATTACKER_VICTORY"
                    : "DEFENDER_VICTORY",
                endedAt: new Date(),
              })
              .where(eq(war.id, input.warId));

            // Apply victory bonuses to winner and allies
            const winnerVillageId = killer.villageId;
            const winnerVillage = await tx
              .select()
              .from(village)
              .where(eq(village.id, winnerVillageId!));

            if (winnerVillage[0]) {
              await tx
                .update(village)
                .set({
                  tokens: winnerVillage[0].tokens + 100000,
                })
                .where(eq(village.id, winnerVillageId!));
            }

            // TODO: Apply structure downgrades to loser village
            // TODO: Apply victory bonuses to allies and hired factions
          }
        }
      });

      return { success: true };
    }),

  // Surrender in war
  surrender: protectedProcedure
    .input(z.object({ warId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is kage
      const userVillage = await ctx.db.query.village.findFirst({
        where: eq(village.kageId, ctx.auth.userId),
      });

      if (!userVillage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only kages can surrender",
        });
      }

      // Check if war exists and is active
      const currentWar = await ctx.db.query.war.findFirst({
        where: and(
          eq(war.id, input.warId),
          eq(war.status, "ACTIVE"),
          or(
            eq(war.attackerVillageId, userVillage.id),
            eq(war.defenderVillageId, userVillage.id),
          ),
        ),
      });

      if (!currentWar) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "War not found or not active",
        });
      }

      // End war with surrender
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(war)
          .set({
            status: "SURRENDERED",
            endedAt: new Date(),
          })
          .where(eq(war.id, input.warId));

        // Apply victory bonuses to winner
        const winnerVillageId =
          currentWar.attackerVillageId === userVillage.id
            ? currentWar.defenderVillageId
            : currentWar.attackerVillageId;

        const winnerVillage = await tx
          .select()
          .from(village)
          .where(eq(village.id, winnerVillageId));

        if (winnerVillage[0]) {
          await tx
            .update(village)
            .set({
              tokens: winnerVillage[0].tokens + 100000,
            })
            .where(eq(village.id, winnerVillageId));
        }

        // TODO: Apply structure downgrades to loser village
        // TODO: Apply victory bonuses to allies and hired factions
      });

      return { success: true };
    }),
});
