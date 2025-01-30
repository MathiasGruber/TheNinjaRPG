import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, or } from "drizzle-orm";
import { war, warFaction, warStat, warKill, village, userData, villageDefense, villageDefenseWall, warDefenseTarget } from "@/drizzle/schema";
import { nanoid } from "nanoid";
import type {
  War,
  WarStat,
  WarFaction,
  Village,
  VillageDefense,
  VillageDefenseWall,
  WarDefenseTarget,
  VillageDefenseType,
  WarDefenseTargetType,
  MutationResponse,
  WarStatus,
  WarStructure,
  WarWall,
  WarTarget,
  UserData,
} from "./war.types";

export const warRouter = createTRPCRouter({
  // Get war status including structure HP
  getWarStatus: protectedProcedure
    .input(z.object({ warId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentWar = await ctx.drizzle
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
        .where(eq(war.id, input.warId))
        .then((rows) => rows[0] as WarStatus | undefined);

      if (!currentWar) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "War not found",
        });
      }

      // Get structures for both villages
      const [attackerStructures, defenderStructures] = await Promise.all([
        ctx.drizzle
          .select({
            type: villageDefense.type,
            defenseLevel: villageDefense.defenseLevel,
            hp: villageDefense.hp,
          })
          .from(villageDefense)
          .where(eq(villageDefense.villageId, currentWar.attackerVillageId))
          .then((rows) => rows as { type: VillageDefenseType; defenseLevel: number; hp: number }[]),
        ctx.drizzle
          .select({
            type: villageDefense.type,
            defenseLevel: villageDefense.defenseLevel,
            hp: villageDefense.hp,
          })
          .from(villageDefense)
          .where(eq(villageDefense.villageId, currentWar.defenderVillageId))
          .then((rows) => rows as { type: VillageDefenseType; defenseLevel: number; hp: number }[]),
      ]);

      // Get walls for both villages
      const [attackerWall, defenderWall] = await Promise.all([
        ctx.drizzle
          .select({
            level: villageDefenseWall.level,
          })
          .from(villageDefenseWall)
          .where(eq(villageDefenseWall.villageId, currentWar.attackerVillageId))
          .then((rows) => rows[0] as { level: number } | undefined),
        ctx.drizzle
          .select({
            level: villageDefenseWall.level,
          })
          .from(villageDefenseWall)
          .where(eq(villageDefenseWall.villageId, currentWar.defenderVillageId))
          .then((rows) => rows[0] as { level: number } | undefined),
      ]);

      // Get targeted structures
      const targetedStructures = await ctx.drizzle
        .select({
          villageId: warDefenseTarget.villageId,
          structureType: warDefenseTarget.structureType,
        })
        .from(warDefenseTarget)
        .where(eq(warDefenseTarget.warId, input.warId))
        .then((rows) => rows as WarTarget[]);

      return {
        war: currentWar,
        attackerStructures,
        defenderStructures,
        attackerWall: attackerWall?.level ?? 1,
        defenderWall: defenderWall?.level ?? 1,
        targetedStructures,
      };
    }),

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
        .then((rows) => rows[0] as { id: string } | undefined);

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
        .then((rows) => rows[0] as { id: string } | undefined);

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

        // Initialize structures for both villages if they don't exist
        const structureTypes = [
          "TRAINING_GROUND",
          "RAMEN_SHOP",
          "MISSION_HALL",
          "ITEM_SHOP",
          "HOSPITAL",
          "BATTLE_ARENA",
          "BANK",
        ] as const;

        for (const villageId of [userVillage.id, targetVillage.id]) {
          // Get existing structures
          const existingStructures = await tx
            .select({
              type: villageDefense.type,
            })
            .from(villageDefense)
            .where(eq(villageDefense.villageId, villageId))
            .then((rows) => rows as Pick<VillageDefense, "type">[]);

          const existingTypes = new Set(existingStructures.map((s) => s.type));

          // Create missing structures
          for (const type of structureTypes) {
            if (!existingTypes.has(type)) {
              await tx.insert(villageDefense).values({
                id: nanoid(),
                villageId,
                type: type as VillageDefenseType,
                defenseLevel: 1,
                hp: 1000,
              } satisfies Omit<VillageDefense, "lastUpdatedAt">);
            }
          }

          // Initialize wall if it doesn't exist
          const wall = await tx
            .select({
              id: villageDefenseWall.id,
            })
            .from(villageDefenseWall)
            .where(eq(villageDefenseWall.villageId, villageId))
            .then((rows) => rows[0] as Pick<VillageDefenseWall, "id"> | undefined);

          if (!wall) {
            await tx.insert(villageDefenseWall).values({
              id: nanoid(),
              villageId,
              level: 1,
            } satisfies Omit<VillageDefenseWall, "lastUpdatedAt">);
          }
        }
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
        .then((rows) => rows[0] as { id: string } | undefined);

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
        .then((rows) => rows[0] as { id: string } | undefined);

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
        } satisfies Omit<WarFaction, "joinedAt">);
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
            rank: userData.rank,
          })
          .from(userData)
          .where(eq(userData.userId, ctx.userId))
          .then((rows) => rows[0] as UserData | undefined),
        ctx.drizzle
          .select({
            userId: userData.userId,
            villageId: userData.villageId,
          })
          .from(userData)
          .where(eq(userData.userId, input.victimId))
          .then((rows) => rows[0] as Pick<UserData, "userId" | "villageId"> | undefined),
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
      } else if (killer.rank === "ELDER") {
        enemyTownHallDamage = 50;
        ownTownHallHeal = 40;
      } else if (killer.villageId === currentWar.attackerVillageId) {
        const attackerVillage = await ctx.drizzle
          .select({
            kageId: village.kageId,
          })
          .from(village)
          .where(eq(village.id, currentWar.attackerVillageId))
          .then((rows) => rows[0] as { kageId: string } | undefined);
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
          .then((rows) => rows[0] as { kageId: string } | undefined);
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
            .then((rows) => rows[0] as { id: string; townHallHp: number } | undefined),
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
            .then((rows) => rows[0] as { id: string; townHallHp: number } | undefined),
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

          // If killer is ANBU, check for targeted structures
          if (killer.anbuId) {
            const targetedStructure = await tx
              .select({
                structureType: warDefenseTarget.structureType,
              })
              .from(warDefenseTarget)
              .where(
                and(
                  eq(warDefenseTarget.warId, input.warId),
                  eq(warDefenseTarget.villageId, victim.villageId!),
                ),
              )
              .then((rows) => rows[0] as { structureType: WarDefenseTargetType } | undefined);

            if (targetedStructure) {
              // Get structure HP
              const structure = await tx
                .select({
                  id: villageDefense.id,
                  hp: villageDefense.hp,
                  defenseLevel: villageDefense.defenseLevel,
                })
                .from(villageDefense)
                .where(
                  and(
                    eq(villageDefense.villageId, victim.villageId!),
                    eq(villageDefense.type, targetedStructure.structureType),
                  ),
                )
                .then((rows) => rows[0] as Pick<VillageDefense, "id" | "hp" | "defenseLevel"> | undefined);

              if (structure && structure.hp > 0) {
                // Update structure HP
                const newHp = Math.max(0, structure.hp - enemyTownHallDamage);
                await tx
                  .update(villageDefense)
                  .set({ hp: newHp })
                  .where(eq(villageDefense.id, structure.id));

                // If structure HP reached 0, downgrade it
                if (newHp === 0) {
                  await tx
                    .update(villageDefense)
                    .set({
                      defenseLevel: Math.max(1, structure.defenseLevel - 1),
                      hp: Math.max(1, structure.defenseLevel - 1) * 1000,
                    })
                    .where(eq(villageDefense.id, structure.id));

                  // Remove target since structure is destroyed
                  await tx
                    .delete(warDefenseTarget)
                    .where(
                      and(
                        eq(warDefenseTarget.warId, input.warId),
                        eq(warDefenseTarget.villageId, victim.villageId!),
                      ),
                    );
                }
              }
            }
          }

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
              .then((rows) => rows[0] as Pick<Village, "id" | "tokens"> | undefined);

            if (winnerVillage) {
              await tx
                .update(village)
                .set({
                  tokens: winnerVillage.tokens + 100000,
                })
                .where(eq(village.id, winnerVillageId!));

              // Downgrade all structures of losing village
              const loserStructures = await tx
                .select({
                  id: villageDefense.id,
                  defenseLevel: villageDefense.defenseLevel,
                })
                .from(villageDefense)
                .where(eq(villageDefense.villageId, victim.villageId!))
                .then((rows) => rows as { id: string; defenseLevel: number }[]);

              for (const structure of loserStructures) {
                await tx
                  .update(villageDefense)
                  .set({
                    defenseLevel: Math.max(1, structure.defenseLevel - 1),
                    hp: Math.max(1, structure.defenseLevel - 1) * 1000,
                  })
                  .where(eq(villageDefense.id, structure.id));
              }
            }

            // TODO: Apply victory bonuses to allies and hired factions
          }
        }
      });

      return { success: true, message: "Kill recorded successfully" };
    }),

  // Upgrade village structure defense
  upgradeStructureDefense: protectedProcedure
    .input(
      z.object({
        structureType: z.enum([
          "TRAINING_GROUND",
          "RAMEN_SHOP",
          "MISSION_HALL",
          "ITEM_SHOP",
          "HOSPITAL",
          "BATTLE_ARENA",
          "BANK",
        ]),
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
          message: "Only kages can upgrade structure defenses",
        });
      }

      // Check if village has enough tokens
      if (userVillage.tokens < 100000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough village tokens to upgrade structure defense (100,000 required)",
        });
      }

      // Get current structure
      const structure = await ctx.drizzle
        .select({
          id: villageStructure.id,
          defenseLevel: villageStructure.defenseLevel,
        })
        .from(villageStructure)
        .where(
          and(
            eq(villageStructure.villageId, userVillage.id),
            eq(villageStructure.type, input.structureType),
          ),
        )
        .then((rows) => rows[0]);

      if (!structure) {
        // Create new structure
        await ctx.drizzle.transaction(async (tx) => {
          await tx
            .update(village)
            .set({ tokens: userVillage.tokens - 100000 })
            .where(eq(village.id, userVillage.id));

          await tx.insert(villageStructure).values({
            id: nanoid(),
            villageId: userVillage.id,
            type: input.structureType,
            defenseLevel: 1,
            hp: 1000,
          } satisfies Omit<VillageStructure, "lastUpdatedAt">);
        });

        return { success: true, message: "Structure defense created successfully" };
      }

      if (structure.defenseLevel >= 5) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Structure defense is already at maximum level",
        });
      }

      // Upgrade structure
      await ctx.drizzle.transaction(async (tx) => {
        await tx
          .update(village)
          .set({ tokens: userVillage.tokens - 100000 })
          .where(eq(village.id, userVillage.id));

        await tx
          .update(villageStructure)
          .set({
            defenseLevel: structure.defenseLevel + 1,
            hp: (structure.defenseLevel + 1) * 1000,
          })
          .where(eq(villageStructure.id, structure.id));
      });

      return { success: true, message: "Structure defense upgraded successfully" };
    }),

  // Upgrade village wall
  upgradeVillageWall: protectedProcedure.mutation(async ({ ctx }): Promise<MutationResponse> => {
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
        message: "Only kages can upgrade village wall",
      });
    }

    // Check if village has enough tokens
    if (userVillage.tokens < 30000) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Not enough village tokens to upgrade wall (30,000 required)",
      });
    }

    // Get current wall
    const wall = await ctx.drizzle
      .select({
        id: villageWall.id,
        level: villageWall.level,
      })
      .from(villageWall)
      .where(eq(villageWall.villageId, userVillage.id))
      .then((rows) => rows[0]);

    if (!wall) {
      // Create new wall
      await ctx.drizzle.transaction(async (tx) => {
        await tx
          .update(village)
          .set({ tokens: userVillage.tokens - 30000 })
          .where(eq(village.id, userVillage.id));

        await tx.insert(villageWall).values({
          id: nanoid(),
          villageId: userVillage.id,
          level: 1,
        } satisfies Omit<VillageWall, "lastUpdatedAt">);
      });

      return { success: true, message: "Village wall created successfully" };
    }

    if (wall.level >= 3) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Village wall is already at maximum level",
      });
    }

    // Upgrade wall
    await ctx.drizzle.transaction(async (tx) => {
      await tx
        .update(village)
        .set({ tokens: userVillage.tokens - 30000 })
        .where(eq(village.id, userVillage.id));

      await tx
        .update(villageWall)
        .set({ level: wall.level + 1 })
        .where(eq(villageWall.id, wall.id));
    });

    return { success: true, message: "Village wall upgraded successfully" };
  }),

  // Set ANBU target structure
  setAnbuTarget: protectedProcedure
    .input(
      z.object({
        warId: z.string(),
        villageId: z.string(),
        structureType: z.enum([
          "TRAINING_GROUND",
          "RAMEN_SHOP",
          "MISSION_HALL",
          "ITEM_SHOP",
          "HOSPITAL",
          "BATTLE_ARENA",
          "BANK",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<MutationResponse> => {
      // Check if user is kage
      const userVillage = await ctx.drizzle
        .select({
          id: village.id,
          kageId: village.kageId,
        })
        .from(village)
        .where(eq(village.kageId, ctx.userId))
        .then((rows) => rows[0]);

      if (!userVillage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only kages can set ANBU targets",
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
        .then((rows) => rows[0]);

      if (!currentWar) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "War not found or not active",
        });
      }

      // Check if target village is enemy
      if (input.villageId !== currentWar.attackerVillageId && input.villageId !== currentWar.defenderVillageId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target village is not part of this war",
        });
      }

      if (input.villageId === userVillage.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot target own village structures",
        });
      }

      // Check if structure exists and has HP
      const structure = await ctx.drizzle
        .select({
          hp: villageStructure.hp,
        })
        .from(villageStructure)
        .where(
          and(
            eq(villageStructure.villageId, input.villageId),
            eq(villageStructure.type, input.structureType),
          ),
        )
        .then((rows) => rows[0]);

      if (!structure || structure.hp <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Structure is not available for targeting",
        });
      }

      // Set target
      await ctx.drizzle.transaction(async (tx) => {
        // Remove any existing targets
        await tx
          .delete(warStructureTarget)
          .where(
            and(
              eq(warStructureTarget.warId, input.warId),
              eq(warStructureTarget.villageId, input.villageId),
            ),
          );

        // Add new target
        await tx.insert(warStructureTarget).values({
          id: nanoid(),
          warId: input.warId,
          villageId: input.villageId,
          structureType: input.structureType,
        } satisfies Omit<WarStructureTarget, "lastUpdatedAt">);
      });

      return { success: true, message: "ANBU target set successfully" };
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
