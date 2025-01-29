import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, inArray, sql, and, or, gte, ne, like, desc } from "drizzle-orm";
import {
  jutsu,
  userJutsu,
  userData,
  actionLog,
  jutsuLoadout,
  bloodline,
} from "@/drizzle/schema";
import { fetchUser, fetchUpdatedUser } from "./profile";
import { canTrainJutsu } from "@/libs/train";
import { getNewTrackers } from "@/libs/quest";
import { JUTSU_LEVEL_CAP } from "@/drizzle/constants";
import {
  calcJutsuTrainTime,
  calcJutsuTrainCost,
  calcJutsuEquipLimit,
} from "@/libs/train";
import { JutsuValidator } from "@/libs/combat/types";
import { canChangeContent, canEditPublicUser } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import { createTRPCRouter, errorResponse } from "@/server/api/trpc";
import { protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { serverError, baseServerResponse } from "@/server/api/trpc";
import { fedJutsuLoadouts } from "@/utils/paypal";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import { JUTSU_MAX_RESIDUAL_EQUIPPED } from "@/drizzle/constants";
import { calculateContentDiff } from "@/utils/diff";
import { jutsuFilteringSchema } from "@/validators/jutsu";
import { QuestTracker } from "@/validators/objectives";
import type { JutsuFilteringSchema } from "@/validators/jutsu";
import type { ZodAllTags } from "@/libs/combat/types";
import type { DrizzleClient } from "@/server/db";
import { TRPCError } from "@trpc/server";

export const jutsuRouter = createTRPCRouter({
  getAllNames: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.jutsu.findMany({
      columns: { id: true, name: true, image: true },
    });
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await fetchJutsu(ctx.drizzle, input.id);
      if (!result) {
        throw serverError("NOT_FOUND", "Jutsu not found");
      }
      return result as Omit<typeof result, "effects"> & { effects: ZodAllTags[] };
    }),

  getAll: publicProcedure
    .input(
      jutsuFilteringSchema.extend({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
        hideAi: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ?? 0;
      const skip = currentCursor * input.limit;

      // Build the base DB filter
      const baseFilters = jutsuDatabaseFilter(input);

      const results = await ctx.drizzle.query.jutsu.findMany({
        where: and(
          ...baseFilters,
          ...(input.hideAi ? [ne(jutsu.jutsuType, "AI")] : []),
        ),
        orderBy: (table) => desc(table.updatedAt),
        offset: skip,
        with: {
          bloodline: {
            columns: {
              name: true,
            },
          },
        },
        limit: input.limit,
      });

      // Post-filter to handle "must have these elements, stats, etc." all in the SAME effect
      const filtered = results.filter((oneJutsu) => {
        if (
          input.stat ||
          input.effect ||
          input.element ||
          input.appear ||
          input.static ||
          input.disappear
        ) {
          return oneJutsu.effects.some((e) => {
            const asString = JSON.stringify(e);

            // Merge statTypes + generalTypes if that's how your code works
            const effectStats = [
              ...("statTypes" in e && e.statTypes ? e.statTypes : []),
              ...("generalTypes" in e && e.generalTypes ? e.generalTypes : []),
            ];
            const effectElements = [
              ...("elements" in e && e.elements ? e.elements : []),
            ] as string[];

            // Return true if it matches the includes
            return (
              (!input.stat || input.stat.every((x) => effectStats.includes(x))) &&
              (!input.effect || input.effect.some((x) => x === e.type)) &&
              (!input.element ||
                input.element.every((x) => effectElements.includes(x))) &&
              (!input.appear || asString.includes(input.appear)) &&
              (!input.static || asString.includes(input.static)) &&
              (!input.disappear || asString.includes(input.disappear))
            );
          });
        }
        // If no arrays, keep it
        return true;
      });

      // Next cursor if more rows
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;

      return {
        data: filtered,
        nextCursor: nextCursor,
      };
    }),

  getLoadouts: protectedProcedure.query(async ({ ctx }) => {
    const [loadouts, user] = await Promise.all([
      fetchLoadouts(ctx.drizzle, ctx.userId),
      fetchUser(ctx.drizzle, ctx.userId),
    ]);
    const maxLoadouts = fedJutsuLoadouts(user);

    // Create missing loadouts if needed
    if (loadouts.length < maxLoadouts) {
      for (let i = loadouts.length; i < maxLoadouts; i++) {
        const loadout = {
          id: nanoid(),
          userId: ctx.userId,
          jutsuIds: [],
          createdAt: new Date(),
        };
        await ctx.drizzle.insert(jutsuLoadout).values(loadout);
        loadouts.push(loadout);
      }
    }

    // If more than one loadout, and no user loadout, set it to the first
    if (loadouts?.[0] && !user.jutsuLoadout) {
      await ctx.drizzle
        .update(userData)
        .set({ jutsuLoadout: loadouts[0].id })
        .where(eq(userData.userId, ctx.userId));
    }

    return maxLoadouts < loadouts.length ? loadouts.slice(0, maxLoadouts) : loadouts;
  }),

  selectJutsuLoadout: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [loadouts, user] = await Promise.all([
        fetchLoadouts(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      const loadout = loadouts.find((l) => l.id === input.id);
      const maxLoadouts = fedJutsuLoadouts(user);

      if (!loadout) return errorResponse("Loadout not found");
      if (maxLoadouts <= 0) return errorResponse("Loadouts not available");

      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ jutsuLoadout: loadout.id })
          .where(eq(userData.userId, ctx.userId)),
        ctx.drizzle
          .update(userJutsu)
          .set({
            equipped:
              loadout.jutsuIds.length > 0
                ? sql`CASE WHEN ${inArray(userJutsu.jutsuId, loadout.jutsuIds)} THEN 1 ELSE 0 END`
                : 0,
          })
          .where(eq(userJutsu.userId, ctx.userId)),
      ]);

      return { success: true, message: `Loadout selected` };
    }),

  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(jutsu).values({
        id,
        name: `New Jutsu - ${id}`,
        description: "New jutsu description",
        battleDescription: "%user uses %jutsu on %target",
        effects: [],
        range: 1,
        requiredRank: "STUDENT",
        requiredLevel: 1,
        target: "OTHER_USER",
        jutsuType: "AI",
        image: IMG_AVATAR_DEFAULT,
      });
      return { success: true, message: id };
    } else {
      return { success: false, message: `Not allowed to create jutsu` };
    }
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchJutsu(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        await ctx.drizzle.delete(jutsu).where(eq(jutsu.id, input.id));
        await ctx.drizzle.delete(userJutsu).where(eq(userJutsu.jutsuId, input.id));
        return { success: true, message: `Jutsu deleted` };
      } else {
        return { success: false, message: `Not allowed to delete jutsu` };
      }
    }),

  forget: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const userjutsuObj = userjutsus.find((j) => j.id === input.id);
      if (userjutsuObj) {
        const res1 = await ctx.drizzle
          .delete(userJutsu)
          .where(eq(userJutsu.id, input.id));
        if (res1.rowsAffected === 1) {
          return { success: true, message: `Jutsu forgotten, 0 ryo restored` };
        }
      }
      return { success: false, message: `Could not find jutsu to delete` };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: JutsuValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchJutsu(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Diff
        const diff = calculateContentDiff(entry, {
          id: entry.id,
          updatedAt: entry.updatedAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update
        await Promise.all([
          ctx.drizzle.update(jutsu).set(input.data).where(eq(jutsu.id, input.id)),
          ctx.drizzle.insert(actionLog).values({
            id: nanoid(),
            userId: ctx.userId,
            tableName: "jutsu",
            changes: diff,
            relatedId: entry.id,
            relatedMsg: `Update: ${entry.name}`,
            relatedImage: entry.image,
          }),
          ...(input.data.hidden
            ? [
                ctx.drizzle
                  .update(userJutsu)
                  .set({ equipped: 0 })
                  .where(eq(userJutsu.jutsuId, entry.id)),
              ]
            : []),
        ]);
        if (process.env.NODE_ENV !== "development") {
          await callDiscordContent(user.username, entry.name, diff, entry.image);
        }
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit jutsu` };
      }
    }),

  getUserJutsus: protectedProcedure
    .input(jutsuFilteringSchema)
    .query(async ({ ctx, input }) => {
      const [user, results] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserJutsus(ctx.drizzle, ctx.userId, input),
      ]);
      return results.filter((userjutsu) => {
        return (
          userjutsu.jutsu?.bloodlineId === "" ||
          user?.bloodlineId === userjutsu.jutsu?.bloodlineId
        );
      });
    }),
  // Get jutsus of public user
  getPublicUserJutsus: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Query
      const [user, results] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserJutsus(ctx.drizzle, input.userId),
      ]);
      // Guard
      if (!canEditPublicUser(user)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not allowed to edit public user",
        });
      }
      // Return
      return results;
    }),
  // Adjust jutsu level of public user
  adjustJutsuLevel: protectedProcedure
    .input(z.object({ userId: z.string(), jutsuId: z.string(), level: z.number() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, userjutsus] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserJutsus(ctx.drizzle, input.userId),
      ]);
      // Guard)
      if (!canEditPublicUser(user)) {
        return errorResponse("Not allowed to edit public user");
      }
      const userjutsu = userjutsus.find((j) => j.jutsuId === input.jutsuId);
      if (!userjutsu) {
        return errorResponse("Jutsu not found for user");
      }
      // Mutate
      await Promise.all([
        ctx.drizzle
          .update(userJutsu)
          .set({ level: input.level })
          .where(
            and(
              eq(userJutsu.userId, input.userId),
              eq(userJutsu.jutsuId, input.jutsuId),
            ),
          ),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: [
            `Jutsu ${userjutsu.jutsu.name} lvl ${userjutsu.level} -> ${input.level}`,
          ],
          relatedId: input.userId,
          relatedMsg: `Update: ${userjutsu.jutsu.name} level ${userjutsu.level} -> ${input.level}`,
          relatedImage: userjutsu.jutsu.image,
        }),
      ]);
      return { success: true, message: `Jutsu level adjusted to ${input.level}` };
    }),
  // Start training a given jutsu
  startTraining: protectedProcedure
    .input(z.object({ jutsuId: z.string() }))
    .output(
      baseServerResponse.extend({
        data: z
          .object({ money: z.number(), questData: z.array(QuestTracker).nullable() })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [data, info, userjutsus] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchJutsu(ctx.drizzle, input.jutsuId),
        fetchUserJutsus(ctx.drizzle, ctx.userId),
      ]);
      const { user } = data;
      if (!user) return errorResponse("User not found");

      // Derived
      const userjutsuObj = userjutsus.find((j) => j.jutsuId === input.jutsuId);
      const filteredJutsus = userjutsus.filter((uj) => canTrainJutsu(uj.jutsu, user));
      const curEquip = filteredJutsus?.filter((j) => j.equipped).length || 0;
      const maxEquip = userData && calcJutsuEquipLimit(user);
      const residualJutsus = userjutsus.filter(
        (uj) =>
          uj.equipped &&
          uj.jutsu.effects.some((e) => "residualModifier" in e && e.residualModifier),
      );

      if (!info) return errorResponse("Jutsu not found");
      if (!canTrainJutsu(info, user)) return errorResponse("Jutsu not for you");
      if (user.status !== "AWAKE") return errorResponse("Must be awake");

      const level = userjutsuObj ? userjutsuObj.level : 0;
      if (level >= JUTSU_LEVEL_CAP) {
        return errorResponse("Jutsu is already at max level");
      }
      if (info.hidden && !canChangeContent(user.role)) {
        return errorResponse("Jutsu is hidden, cannot be trained");
      }
      if (userjutsus.find((j) => j.finishTraining && j.finishTraining > new Date())) {
        return errorResponse("You are already training a jutsu");
      }

      // Time & cost
      const trainTime = calcJutsuTrainTime(info, level, user);
      const trainCost = calcJutsuTrainCost(info, level);

      // Quests
      let questData = user.questData;
      if (!userjutsuObj) {
        const { trackers } = getNewTrackers(user, [
          { task: "jutsus_mastered", increment: 1 },
        ]);
        questData = trackers;
      }

      // Deduct money
      const moneyUpdate = await ctx.drizzle
        .update(userData)
        .set({ money: sql`${userData.money} - ${trainCost}`, questData: questData })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, trainCost)));
      if (moneyUpdate.rowsAffected !== 1) {
        return errorResponse("You don't have enough money");
      }

      // Insert or update user jutsu
      if (userjutsuObj) {
        await ctx.drizzle
          .update(userJutsu)
          .set({
            level: sql`${userJutsu.level} + 1`,
            finishTraining: new Date(Date.now() + trainTime),
            updatedAt: new Date(),
          })
          .where(
            and(eq(userJutsu.id, userjutsuObj.id), eq(userJutsu.userId, ctx.userId)),
          );
      } else {
        await ctx.drizzle.insert(userJutsu).values({
          id: nanoid(),
          userId: ctx.userId,
          jutsuId: input.jutsuId,
          finishTraining: new Date(Date.now() + trainTime),
          equipped:
            curEquip < maxEquip && residualJutsus.length <= JUTSU_MAX_RESIDUAL_EQUIPPED
              ? 1
              : 0,
        });
      }

      return {
        success: true,
        message: `You started training: ${info.name}`,
        data: { money: user.money - trainCost, questData },
      };
    }),

  stopTraining: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const userjutsuObj = userjutsus.find(
        (j) => j.finishTraining && j.finishTraining > new Date(),
      );
      if (!userjutsuObj) {
        return { success: false, message: "Not training any jutsu" };
      }
      await ctx.drizzle
        .update(userJutsu)
        .set({
          level: sql`${userJutsu.level} - 1`,
          finishTraining: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(userJutsu.id, userjutsuObj.id), eq(userJutsu.userId, ctx.userId)),
        );

      return {
        success: true,
        message: `You stopped training: ${userjutsuObj.jutsu?.name}`,
      };
    }),

  unequipAll: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const [data, loadouts] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchLoadouts(ctx.drizzle, ctx.userId),
      ]);
      const { user } = data;
      if (!user) return errorResponse("User not found");

      const loadout = loadouts.find((l) => l.id === user.jutsuLoadout);

      await Promise.all([
        ctx.drizzle
          .update(userJutsu)
          .set({ equipped: 0 })
          .where(eq(userJutsu.userId, ctx.userId)),
        loadout
          ? ctx.drizzle
              .update(jutsuLoadout)
              .set({ jutsuIds: [] })
              .where(eq(jutsuLoadout.id, loadout.id))
          : null,
      ]);

      return { success: true, message: "All jutsu unequipped" };
    }),

  toggleEquip: protectedProcedure
    .input(z.object({ userJutsuId: z.string() }))
    .output(
      baseServerResponse.extend({
        data: z.object({ equipped: z.number(), jutsuId: z.string() }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [userjutsus, data, loadouts] = await Promise.all([
        fetchUserJutsus(ctx.drizzle, ctx.userId),
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchLoadouts(ctx.drizzle, ctx.userId),
      ]);
      const { user } = data;
      if (!user) return errorResponse("User not found");

      const filteredJutsus = userjutsus.filter((uj) => canTrainJutsu(uj.jutsu, user));
      const userjutsuObj = filteredJutsus.find((j) => j.id === input.userJutsuId);
      const isEquipped = userjutsuObj?.equipped || false;
      const equippedJutsus = filteredJutsus.filter((j) => j.equipped);
      const curEquip = equippedJutsus.length || 0;
      const maxEquip = userData && calcJutsuEquipLimit(user);
      const pierceEquipped = equippedJutsus.filter((j) =>
        j.jutsu.effects.some((e) => e.type === "pierce"),
      ).length;
      const curJutsuIsPierce = userjutsuObj?.jutsu.effects.some(
        (e) => e.type === "pierce",
      );
      const newEquippedState = isEquipped ? 0 : 1;
      const loadout = loadouts.find((l) => l.id === user.jutsuLoadout);
      const isLoaded = userjutsuObj && loadout?.jutsuIds.includes(userjutsuObj.jutsuId);
      const residualJutsus = userjutsus.filter(
        (uj) =>
          uj.equipped &&
          uj.jutsu.effects.some((e) => "residualModifier" in e && e.residualModifier),
      );

      // Guards
      if (
        residualJutsus.length >= JUTSU_MAX_RESIDUAL_EQUIPPED &&
        newEquippedState === 1
      ) {
        return errorResponse(
          `You cannot equip more than ${JUTSU_MAX_RESIDUAL_EQUIPPED} residual jutsu. Please unequip first.`,
        );
      }
      if (!userjutsuObj) return errorResponse("Jutsu not found");
      if (!isEquipped && curEquip >= maxEquip) {
        return errorResponse("You cannot equip more jutsu");
      }
      if (!isEquipped && curJutsuIsPierce && pierceEquipped >= 1) {
        return errorResponse("You cannot equip more than 1 piercing jutsu");
      }

      // Calculate loadout
      if (loadout && isLoaded && newEquippedState === 0) {
        loadout.jutsuIds = loadout.jutsuIds.filter((id) => id !== userjutsuObj.jutsuId);
      } else if (loadout && !isLoaded && newEquippedState === 1) {
        loadout.jutsuIds.push(userjutsuObj.jutsuId);
      }

      await Promise.all([
        ctx.drizzle
          .update(userJutsu)
          .set({ equipped: newEquippedState })
          .where(eq(userJutsu.id, input.userJutsuId)),
        loadout
          ? ctx.drizzle
              .update(jutsuLoadout)
              .set({ jutsuIds: loadout.jutsuIds })
              .where(eq(jutsuLoadout.id, loadout.id))
          : null,
      ]);

      return {
        success: true,
        message: `Jutsu ${isEquipped ? "unequipped" : "equipped"}`,
        data: { equipped: newEquippedState, jutsuId: userjutsuObj.jutsuId },
      };
    }),

  updateUserJutsuOrder: protectedProcedure
    .input(
      z.object({
        jutsuId: z.string(),
        loadoutId: z.string(),
        moveForward: z.boolean(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const loadouts = await fetchLoadouts(ctx.drizzle, ctx.userId);
      const loadout = loadouts.find((l) => l.id === input.loadoutId);
      if (!loadout) return errorResponse("Loadout not found");

      const curIndex = loadout.jutsuIds.indexOf(input.jutsuId);
      if (curIndex === -1) return errorResponse("Jutsu not found in loadout");
      if (curIndex === 0 && !input.moveForward) {
        return errorResponse("Already first");
      }
      if (curIndex === loadout.jutsuIds.length - 1 && input.moveForward) {
        return errorResponse("Already last");
      }

      const withoutJutsu = loadout.jutsuIds.filter((id) => id !== input.jutsuId);
      const newIndex = curIndex + (input.moveForward ? 1 : -1);
      const newOrder = withoutJutsu.splice(0, newIndex);
      newOrder.push(input.jutsuId);
      newOrder.push(...loadout.jutsuIds.filter((id) => !newOrder.includes(id)));

      await ctx.drizzle
        .update(jutsuLoadout)
        .set({ jutsuIds: newOrder })
        .where(eq(jutsuLoadout.id, loadout.id));

      return { success: true, message: `Order updated` };
    }),
});

/**
 * COMMON QUERIES/HELPERS
 */

export const fetchLoadouts = async (client: DrizzleClient, userId: string) => {
  return await client.query.jutsuLoadout.findMany({
    where: eq(jutsuLoadout.userId, userId),
    orderBy: (table) => desc(table.createdAt),
  });
};

export const fetchJutsu = async (client: DrizzleClient, id: string) => {
  return await client.query.jutsu.findFirst({
    where: eq(jutsu.id, id),
  });
};

export const fetchUserJutsus = async (
  client: DrizzleClient,
  userId: string,
  input?: JutsuFilteringSchema,
) => {
  // Grab all userJutsus with Jutsu data
  const userjutsus = await client
    .select()
    .from(userJutsu)
    .innerJoin(jutsu, eq(userJutsu.jutsuId, jutsu.id))
    .leftJoin(bloodline, eq(jutsu.bloodlineId, bloodline.id))
    .where(
      and(
        eq(userJutsu.userId, userId),
        ne(jutsu.jutsuType, "AI"),
        ...jutsuDatabaseFilter(input),
      ),
    )
    .orderBy(desc(userJutsu.level));

  return userjutsus.map((result) => ({
    ...result.UserJutsu,
    jutsu: {
      ...result.Jutsu,
      bloodline: result.Bloodline,
    },
  }));
};

/**
 * Build the DB filtering array, including new EXCLUSIONS.
 */
export const jutsuDatabaseFilter = (input?: JutsuFilteringSchema) => {
  return [
    // -----------------------------
    // Existing "include" conditions
    // -----------------------------
    ...(input?.name ? [like(jutsu.name, `%${input.name}%`)] : []),
    ...(input?.bloodline ? [eq(jutsu.bloodlineId, input.bloodline)] : []),
    ...(input?.requiredLevel ? [gte(jutsu.requiredLevel, input.requiredLevel)] : []),
    ...(input?.rank ? [eq(jutsu.requiredRank, input.rank)] : []),
    ...(input?.rarity ? [eq(jutsu.jutsuRank, input.rarity)] : []),

    ...(input?.appear
      ? [
          sql`JSON_SEARCH(${jutsu.effects}, 'one', ${input.appear}, NULL, '$[*].appearAnimation') IS NOT NULL`,
        ]
      : []),
    ...(input?.static
      ? [
          sql`JSON_SEARCH(${jutsu.effects}, 'one', ${input.static}, NULL, '$[*].staticAnimation') IS NOT NULL`,
        ]
      : []),
    ...(input?.disappear
      ? [
          sql`JSON_SEARCH(${jutsu.effects}, 'one', ${input.disappear}, NULL, '$[*].disappearAnimation') IS NOT NULL`,
        ]
      : []),
    ...(input?.classification
      ? [eq(jutsu.statClassification, input.classification)]
      : []),

    // "Include" elements, stats, effect
    ...(input?.element?.length
      ? [
          and(
            ...input.element.map(
              (e) =>
                sql`JSON_SEARCH(${jutsu.effects}, 'one', ${e}, NULL, '$[*].elements[*]') IS NOT NULL`,
            ),
          ),
        ]
      : []),
    ...(input?.stat?.length
      ? [
          and(
            ...input.stat.map(
              (s) =>
                sql`JSON_SEARCH(${jutsu.effects}, 'one', ${s}, NULL, '$[*].statTypes[*]') IS NOT NULL`,
            ),
          ),
        ]
      : []),
    ...(input?.effect?.length
      ? [
          or(
            ...input.effect.map(
              (e) =>
                sql`JSON_SEARCH(${jutsu.effects}, 'one', ${e}, NULL, '$[*].type') IS NOT NULL`,
            ),
          ),
        ]
      : []),

    ...(input?.method ? [eq(jutsu.method, input.method)] : []),
    ...(input?.target ? [eq(jutsu.target, input.target)] : []),

    // If hidden not specified, show hidden=false
    ...(input?.hidden !== undefined
      ? [eq(jutsu.hidden, input.hidden)]
      : [eq(jutsu.hidden, false)]),

    // ---------------------------
    // Exclude: Single-value cols
    // ---------------------------
    ...(input?.excludedJutsuTypes?.length
      ? input.excludedJutsuTypes.map((excludedType) =>
          ne(jutsu.jutsuType, excludedType as any),
        )
      : []),

    ...(input?.excludedClassifications?.length
      ? input.excludedClassifications.map((c) => ne(jutsu.statClassification, c as any))
      : []),
    ...(input?.excludedRarities?.length
      ? input.excludedRarities.map((r) => ne(jutsu.jutsuRank, r as any))
      : []),
    ...(input?.excludedRanks?.length
      ? input.excludedRanks.map((r) => ne(jutsu.requiredRank, r as any))
      : []),
    ...(input?.excludedMethods?.length
      ? input.excludedMethods.map((m) => ne(jutsu.method, m as any))
      : []),
    ...(input?.excludedTargets?.length
      ? input.excludedTargets.map((t) => ne(jutsu.target, t as any))
      : []),

    // ---------------------------
    // Exclude animations in JSON
    // ---------------------------
    ...(input?.excludedAppear?.length
      ? input.excludedAppear.map(
          (anim) =>
            sql`JSON_SEARCH(${jutsu.effects}, 'one', ${anim}, NULL, '$[*].appearAnimation') IS NULL`,
        )
      : []),
    ...(input?.excludedDisappear?.length
      ? input.excludedDisappear.map(
          (anim) =>
            sql`JSON_SEARCH(${jutsu.effects}, 'one', ${anim}, NULL, '$[*].disappearAnimation') IS NULL`,
        )
      : []),
    ...(input?.excludedStatic?.length
      ? input.excludedStatic.map(
          (anim) =>
            sql`JSON_SEARCH(${jutsu.effects}, 'one', ${anim}, NULL, '$[*].staticAnimation') IS NULL`,
        )
      : []),

    // --------------------------
    // Exclude elements/effects/stats in JSON
    // --------------------------
    ...(input?.excludedElements?.length
      ? input.excludedElements.map(
          (excludedEl) =>
            sql`JSON_SEARCH(${jutsu.effects}, 'one', ${excludedEl}, NULL, '$[*].elements[*]') IS NULL`,
        )
      : []),
    ...(input?.excludedEffects?.length
      ? input.excludedEffects.map(
          (excludedEf) =>
            sql`JSON_SEARCH(${jutsu.effects}, 'one', ${excludedEf}, NULL, '$[*].type') IS NULL`,
        )
      : []),
    ...(input?.excludedStats?.length
      ? input.excludedStats.map(
          (excludedSt) =>
            sql`JSON_SEARCH(${jutsu.effects}, 'one', ${excludedSt}, NULL, '$[*].statTypes[*]') IS NULL`,
        )
      : []),
  ];
};
