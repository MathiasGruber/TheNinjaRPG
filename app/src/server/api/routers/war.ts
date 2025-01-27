import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, or } from "drizzle-orm";
import { war, warFaction, warStat, warKill, village, userData } from "@/drizzle/schema";
import { nanoid } from "nanoid";
import type { InferSelectModel } from "drizzle-orm";

type War = InferSelectModel<typeof war>;
type WarStat = InferSelectModel<typeof warStat>;
type WarFaction = InferSelectModel<typeof warFaction>;
type Village = InferSelectModel<typeof village>;

type MutationResponse = {
  success: boolean;
  message: string;
  warId?: string;
};

export const warRouter = createTRPCRouter({
  // Get active wars for a village
  getActiveWars: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const activeWars = await ctx.drizzle
        .select({
          id: war.id,
          attackerVillageId: war.attackerVillageId,
          defenderVillageId: war.defenderVillageId,
          startedAt: war.startedAt,
          endedAt: war.endedAt,
          status: war.status,
          dailyTokenReduction: war.dailyTokenReduction,
          lastTokenReductionAt: war.lastTokenReductionAt,
        })
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
    .mutation(async ({ ctx, input }): Promise<MutationResponse> => {
      // Check if user is kage
      const userVillage = await ctx.drizzle
        .select({
          id: village.id,
          tokens: village.tokens,
          kageId: village.kageId,
        })
        .from(village)
        .where(eq(village.kageId, ctx.userId))
        .then((rows) => rows[0]);

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
      const targetVillage = await ctx.drizzle
        .select({
          id: village.id,
        })
        .from(village)
        .where(eq(village.id, input.targetVillageId))
        .then((rows) => rows[0]);

      if (!targetVillage) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target village not found",
        });
      }

      // Check if either village is already at war
      const existingWar = await ctx.drizzle
        .select({
          id: war.id,
        })
        .from(war)
        .where(
          and(
            or(
              eq(war.attackerVillageId, userVillage.id),
              eq(war.defenderVillageId, userVillage.id),
              eq(war.attackerVillageId, targetVillage.id),
              eq(war.defenderVillageId, targetVillage.id),
            ),
            eq(war.status, "ACTIVE"),
          ),
        )
        .then((rows) => rows[0]);

      if (existingWar) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One of the villages is already at war",
        });
      }

      // Create war
      const warId = nanoid();
      await ctx.drizzle.transaction(async (tx) => {
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
        } satisfies Omit<War, "startedAt" | "endedAt" | "dailyTokenReduction" | "lastTokenReductionAt">);

        // Create war stats for both villages
        await tx.insert(warStat).values([
          {
            id: nanoid(),
            warId,
            villageId: userVillage.id,
            townHallHp: 5000,
          } satisfies Omit<WarStat, "lastUpdatedAt">,
          {
            id: nanoid(),
            warId,
            villageId: targetVillage.id,
            townHallHp: 5000,
          } satisfies Omit<WarStat, "lastUpdatedAt">,
        ]);
      });

      return { success: true, message: "War declared successfully", warId };
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
    .mutation(async ({ ctx, input }): Promise<MutationResponse> => {
      // Check if user is kage
      const userVillage = await ctx.drizzle
        .select({
          id: village.id,
          tokens: village.tokens,
          kageId: village.kageId,
        })
        .from(village)
        .where(eq(village.kageId, ctx.userId))
        .then((rows) => rows[0]);

      if (!userVillage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only kages can hire factions",
        });
      }

      // Check if war exists and is active
      const currentWar = await ctx.drizzle
        .select({
          id: war.id,
          attackerVillageId: war.attackerVillageId,
          defenderVillageId: war.defenderVillageId,
          status: war.status,
        })
        .from(war)
        .where(
          and(
            eq(war.id, input.warId),
            eq(war.status, "ACTIVE"),
            or(
              eq(war.attackerVillageId, userVillage.id),
              eq(war.defenderVillageId, userVillage.id),
            ),
          ),
        )
        .then((rows) => rows[0] as War | undefined);

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
      const faction = await ctx.drizzle
        .select({
          id: village.id,
        })
        .from(village)
        .where(eq(village.id, input.villageId))
        .then((rows) => rows[0]);

      if (!faction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Faction not found",
        });
      }

      // Check if faction is already hired
      const existingFaction = await ctx.drizzle
        .select({
          id: warFaction.id,
        })
        .from(warFaction)
        .where(
          and(
            eq(warFaction.warId, input.warId),
            eq(warFaction.villageId, input.villageId),
          ),
        )
        .then((rows) => rows[0]);

      if (existingFaction) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Faction already hired",
        });
      }

      // Hire faction
      await ctx.drizzle.transaction(async (tx) => {
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
        } satisfies Omit<WarFaction, "createdAt">);
      });

      return { success: true, message: "Faction hired successfully" };
    }),

  // Record a kill in war
  recordKill: protectedProcedure
    .input(
      z.object({
        warId: z.string(),
        victimId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<MutationResponse> => {
      // Check if war exists and is active
      const currentWar = await ctx.drizzle
        .select({
          id: war.id,
          attackerVillageId: war.attackerVillageId,
          defenderVillageId: war.defenderVillageId,
          status: war.status,
        })
        .from(war)
        .where(and(eq(war.id, input.warId), eq(war.status, "ACTIVE")))
        .then((rows) => rows[0]);

      if (!currentWar) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "War not found or not active",
        });
      }

      // Get killer and victim details
      const [killer, victim] = await Promise.all([
        ctx.drizzle
          .select({
            userId: userData.userId,
            villageId: userData.villageId,
            anbuId: userData.anbuId,
            isElder: userData.isElder,
          })
          .from(userData)
          .where(eq(userData.userId, ctx.userId))
          .then((rows) => rows[0]),
        ctx.drizzle
          .select({
            userId: userData.userId,
            villageId: userData.villageId,
          })
          .from(userData)
          .where(eq(userData.userId, input.victimId))
          .then((rows) => rows[0]),
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
        const attackerVillage = await ctx.drizzle
          .select({
            kageId: village.kageId,
          })
          .from(village)
          .where(eq(village.id, currentWar.attackerVillageId))
          .then((rows) => rows[0]);
        if (attackerVillage?.kageId === killer.userId) {
          enemyTownHallDamage = 80;
          ownTownHallHeal = 70;
        }
      } else if (killer.villageId === currentWar.defenderVillageId) {
        const defenderVillage = await ctx.drizzle
          .select({
            kageId: village.kageId,
          })
          .from(village)
          .where(eq(village.id, currentWar.defenderVillageId))
          .then((rows) => rows[0]);
        if (defenderVillage?.kageId === killer.userId) {
          enemyTownHallDamage = 80;
          ownTownHallHeal = 70;
        }
      }

      // Record kill and update town hall HP
      await ctx.drizzle.transaction(async (tx) => {
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
            .select({
              id: warStat.id,
              townHallHp: warStat.townHallHp,
            })
            .from(warStat)
            .where(
              and(
                eq(warStat.warId, input.warId),
                eq(warStat.villageId, killer.villageId!),
              ),
            )
            .then((rows) => rows[0] as WarStat | undefined),
          tx
            .select({
              id: warStat.id,
              townHallHp: warStat.townHallHp,
            })
            .from(warStat)
            .where(
              and(
                eq(warStat.warId, input.warId),
                eq(warStat.villageId, victim.villageId!),
              ),
            )
            .then((rows) => rows[0] as WarStat | undefined),
        ]);

        if (killerVillageStat && victimVillageStat) {
          await Promise.all([
            tx
              .update(warStat)
              .set({
                townHallHp: Math.min(
                  5000,
                  killerVillageStat.townHallHp + ownTownHallHeal,
                ),
              })
              .where(eq(warStat.id, killerVillageStat.id)),
            tx
              .update(warStat)
              .set({
                townHallHp: Math.max(
                  0,
                  victimVillageStat.townHallHp - enemyTownHallDamage,
                ),
              })
              .where(eq(warStat.id, victimVillageStat.id)),
          ]);

          // Check if victim's town hall HP reached 0
          if (victimVillageStat.townHallHp - enemyTownHallDamage <= 0) {
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
              .select({
                id: village.id,
                tokens: village.tokens,
              })
              .from(village)
              .where(eq(village.id, winnerVillageId!))
              .then((rows) => rows[0] as Village | undefined);

            if (winnerVillage) {
              await tx
                .update(village)
                .set({
                  tokens: winnerVillage.tokens + 100000,
                })
                .where(eq(village.id, winnerVillageId!));
            }

            // TODO: Apply structure downgrades to loser village
            // TODO: Apply victory bonuses to allies and hired factions
          }
        }
      });

      return { success: true, message: "Kill recorded successfully" };
    }),

  // Surrender in war
  surrender: protectedProcedure
    .input(z.object({ warId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<MutationResponse> => {
      // Check if user is kage
      const userVillage = await ctx.drizzle
        .select({
          id: village.id,
          kageId: village.kageId,
        })
        .from(village)
        .where(eq(village.kageId, ctx.userId))
        .then((rows) => rows[0] as Village | undefined);

      if (!userVillage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only kages can surrender",
        });
      }

      // Check if war exists and is active
      const currentWar = await ctx.drizzle
        .select({
          id: war.id,
          attackerVillageId: war.attackerVillageId,
          defenderVillageId: war.defenderVillageId,
          status: war.status,
        })
        .from(war)
        .where(
          and(
            eq(war.id, input.warId),
            eq(war.status, "ACTIVE"),
            or(
              eq(war.attackerVillageId, userVillage.id),
              eq(war.defenderVillageId, userVillage.id),
            ),
          ),
        )
        .then((rows) => rows[0] as War | undefined);

      if (!currentWar) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "War not found or not active",
        });
      }

      // End war with surrender
      await ctx.drizzle.transaction(async (tx) => {
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
          .select({
            id: village.id,
            tokens: village.tokens,
          })
          .from(village)
          .where(eq(village.id, winnerVillageId))
          .then((rows) => rows[0] as Village | undefined);

        if (winnerVillage) {
          await tx
            .update(village)
            .set({
              tokens: winnerVillage.tokens + 100000,
            })
            .where(eq(village.id, winnerVillageId));
        }

        // TODO: Apply structure downgrades to loser village
        // TODO: Apply victory bonuses to allies and hired factions
      });

      return { success: true, message: "War surrendered successfully" };
    }),
});
