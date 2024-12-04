import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, inArray, isNotNull, sql, and, or, gte, ne, like, desc } from "drizzle-orm";
import { jutsu, userJutsu, userData, actionLog, jutsuLoadout } from "@/drizzle/schema";
import { bloodline } from "@/drizzle/schema";
import { fetchUser, fetchUpdatedUser } from "./profile";
import { canTrainJutsu } from "@/libs/train";
import { getNewTrackers } from "@/libs/quest";
import { JUTSU_LEVEL_CAP } from "@/drizzle/constants";
import { calcJutsuTrainTime, calcJutsuTrainCost } from "@/libs/train";
import { calcJutsuEquipLimit } from "@/libs/train";
import { JutsuValidator } from "@/libs/combat/types";
import { canChangeContent } from "@/utils/permissions";
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
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.jutsu.findMany({
        where: and(
          ...jutsuDatabaseFilter(input),
          ...(input.hideAi ? [ne(jutsu.jutsuType, "AI")] : []),
        ),
        orderBy: (table, { desc }) => desc(table.updatedAt),
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
      // Post-filter to make sure we get entries where all the filters match on the same tag
      const filtered = results.filter((jutsu) => {
        if (
          input.stat ||
          input.effect ||
          input.element ||
          input.appear ||
          input.static ||
          input.disappear
        ) {
          return jutsu.effects.some((e) => {
            // Convenience vars for searching in
            const asString = JSON.stringify(e);
            const effectStats = [
              ...("statTypes" in e && e.statTypes ? e.statTypes : []),
              ...("generalTypes" in e && e.generalTypes ? e.generalTypes : []),
            ];
            const effectElements = [
              ...("elements" in e && e.elements ? e.elements : []),
            ] as string[];
            // Perform check within single effects
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
        return true;
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: filtered,
        nextCursor: nextCursor,
      };
    }),
  // Get jutsu loadouts for user
  getLoadouts: protectedProcedure.query(async ({ ctx }) => {
    // Query
    const [loadouts, user] = await Promise.all([
      fetchLoadouts(ctx.drizzle, ctx.userId),
      fetchUser(ctx.drizzle, ctx.userId),
    ]);
    // Derived
    const maxLoadouts = fedJutsuLoadouts(user);
    // If more loadouts available, create them
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
    // Return loadouts
    return maxLoadouts < loadouts.length ? loadouts.slice(0, maxLoadouts) : loadouts;
  }),
  // Select different loadout
  selectJutsuLoadout: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [loadouts, user] = await Promise.all([
        fetchLoadouts(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      // Derived
      const loadout = loadouts.find((l) => l.id === input.id);
      const maxLoadouts = fedJutsuLoadouts(user);
      // Guard
      if (!loadout) return errorResponse("Loadout not found");
      if (maxLoadouts <= 0) return errorResponse("Loadouts not available");
      // Mutate
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
  // Create new jutsu
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(jutsu).values({
        id: id,
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
  // Delete a jutsu
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
  // Forget a user jutsu
  forget: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const userjutsu = userjutsus.find((j) => j.id === input.id);
      if (userjutsu) {
        const res1 = await ctx.drizzle
          .delete(userJutsu)
          .where(eq(userJutsu.id, input.id));
        if (res1.rowsAffected === 1) {
          return { success: true, message: `Jutsu forgotten, 0 ryo restored` };
        }
      }
      return { success: false, message: `Could not find jutsu to delete` };
    }),
  // Update a jutsu
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: JutsuValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchJutsu(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Calculate diff
        const diff = calculateContentDiff(entry, {
          id: entry.id,
          updatedAt: entry.updatedAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update database
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
  // Get all uset jutsu
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
      // Fetch
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
      const userjutsu = userjutsus.find((j) => j.jutsuId === input.jutsuId);
      const filteredJutsus = userjutsus.filter((uj) => canTrainJutsu(uj.jutsu, user));
      const curEquip = filteredJutsus?.filter((j) => j.equipped).length || 0;
      const maxEquip = userData && calcJutsuEquipLimit(user);
      const residualJutsus = userjutsus.filter(
        (userjutsu) =>
          userjutsu.equipped &&
          userjutsu.jutsu.effects.some(
            (e) => "residualModifier" in e && e.residualModifier,
          ),
      );
      // Guards
      if (!info) return errorResponse("Jutsu not found");
      if (!canTrainJutsu(info, user)) return errorResponse("Jutsu not for you");
      if (user.status !== "AWAKE") return errorResponse("Must be awake");
      const level = userjutsu ? userjutsu.level : 0;
      const trainTime = calcJutsuTrainTime(info, level, user);
      const trainCost = calcJutsuTrainCost(info, level);
      if (info.hidden && !canChangeContent(user.role)) {
        return errorResponse("Jutsu is hidden, cannot be trained");
      }
      if (userjutsus.find((j) => j.finishTraining && j.finishTraining > new Date())) {
        return errorResponse("You are already training a jutsu");
      }
      if (level >= JUTSU_LEVEL_CAP) {
        return errorResponse("Jutsu is already at max level");
      }
      // Update quest information
      let questData = user.questData;
      if (!userjutsu) {
        const { trackers } = getNewTrackers(user, [
          { task: "jutsus_mastered", increment: 1 },
        ]);
        questData = trackers;
      }
      // Mutate
      const moneyUpdate = await ctx.drizzle
        .update(userData)
        .set({ money: sql`${userData.money} - ${trainCost}`, questData: questData })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, trainCost)));
      if (moneyUpdate.rowsAffected !== 1) {
        return errorResponse("You don't have enough money");
      }
      if (userjutsu) {
        await ctx.drizzle
          .update(userJutsu)
          .set({
            level: sql`${userJutsu.level} + 1`,
            finishTraining: new Date(Date.now() + trainTime),
            updatedAt: new Date(),
          })
          .where(and(eq(userJutsu.id, userjutsu.id), eq(userJutsu.userId, ctx.userId)));
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
  // Stop training jutsu
  stopTraining: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const userjutsu = userjutsus.find(
        (j) => j.finishTraining && j.finishTraining > new Date(),
      );
      if (!userjutsu) {
        return { success: false, message: "Not training any jutsu" };
      }
      await ctx.drizzle
        .update(userJutsu)
        .set({
          level: sql`${userJutsu.level} - 1`,
          finishTraining: null,
          updatedAt: new Date(),
        })
        .where(and(eq(userJutsu.id, userjutsu.id), eq(userJutsu.userId, ctx.userId)));
      return {
        success: true,
        message: `You stopped training: ${userjutsu.jutsu?.name}`,
      };
    }),
  // Unequip all
  unequipAll: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Fetch
      const [data, loadouts] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchLoadouts(ctx.drizzle, ctx.userId),
      ]);
      const { user } = data;
      if (!user) return errorResponse("User not found");
      // Derived
      const loadout = loadouts.find((l) => l.id === user.jutsuLoadout);
      // Mutate
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

  // Toggle whether an item is equipped
  toggleEquip: protectedProcedure
    .input(z.object({ userJutsuId: z.string() }))
    .output(
      baseServerResponse.extend({
        data: z.object({ equipped: z.number(), jutsuId: z.string() }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch
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
      // Derived
      const filteredJutsus = userjutsus.filter((uj) => canTrainJutsu(uj.jutsu, user));
      const userjutsu = filteredJutsus.find((j) => j.id === input.userJutsuId);
      const isEquipped = userjutsu?.equipped || false;
      const equippedJutsus = filteredJutsus.filter((j) => j.equipped);
      const curEquip = equippedJutsus.length || 0;
      const maxEquip = userData && calcJutsuEquipLimit(user);
      const pierceEquipped = equippedJutsus.filter((j) =>
        j.jutsu.effects.some((e) => e.type === "pierce"),
      ).length;
      const curJutsuIsPierce = userjutsu?.jutsu.effects.some(
        (e) => e.type === "pierce",
      );
      const newEquippedState = isEquipped ? 0 : 1;
      const loadout = loadouts.find((l) => l.id === user.jutsuLoadout);
      const isLoaded = userjutsu && loadout?.jutsuIds.includes(userjutsu.jutsuId);
      const residualJutsus = userjutsus.filter(
        (userjutsu) =>
          userjutsu.equipped &&
          userjutsu.jutsu.effects.some(
            (e) => "residualModifier" in e && e.residualModifier,
          ),
      );
      // Guard
      if (
        residualJutsus.length > JUTSU_MAX_RESIDUAL_EQUIPPED &&
        newEquippedState === 1
      ) {
        return errorResponse(
          `You cannot equip more than ${JUTSU_MAX_RESIDUAL_EQUIPPED} residual jutsu. Please unequip first.`,
        );
      }
      if (!userjutsu) return errorResponse("Jutsu not found");
      if (!isEquipped && curEquip >= maxEquip) {
        return errorResponse("You cannot equip more jutsu");
      }
      if (!isEquipped && curJutsuIsPierce && pierceEquipped >= 1) {
        return errorResponse("You cannot equip more than 1 piercing jutsu");
      }
      // Calculate loadout
      if (loadout && isLoaded && newEquippedState === 0) {
        loadout.jutsuIds = loadout.jutsuIds.filter((id) => id !== userjutsu.jutsuId);
      } else if (loadout && !isLoaded && newEquippedState === 1) {
        loadout.jutsuIds.push(userjutsu.jutsuId);
      }
      // Mutate
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
        data: { equipped: newEquippedState, jutsuId: userjutsu.jutsuId },
      };
    }),
  // Toggle whether an item is equipped
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
      // Fetch
      const loadouts = await fetchLoadouts(ctx.drizzle, ctx.userId);
      // Derived
      const loadout = loadouts.find((l) => l.id === input.loadoutId);
      const curIndex = loadout?.jutsuIds.indexOf(input.jutsuId) ?? -1;
      // Guard
      if (!loadout) return errorResponse("Loadout not found");
      if (curIndex === -1) return errorResponse("Jutsu not found in loadout");
      if (curIndex === 0 && !input.moveForward) return errorResponse("Already first");
      if (curIndex === loadout.jutsuIds.length - 1 && input.moveForward) {
        return errorResponse("Already last");
      }
      // New ordered array of IDs
      const withoutJutsu = loadout.jutsuIds.filter((id) => id !== input.jutsuId);
      const newIndex = curIndex + (input.moveForward ? 1 : -1);
      const newOrder = withoutJutsu.splice(0, newIndex);
      newOrder.push(input.jutsuId);
      newOrder.push(...loadout.jutsuIds.filter((id) => !newOrder.includes(id)));
      // Mutate
      await ctx.drizzle
        .update(jutsuLoadout)
        .set({ jutsuIds: newOrder })
        .where(eq(jutsuLoadout.id, loadout.id));
      // Inform
      return { success: true, message: `Order updated` };
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchLoadouts = async (client: DrizzleClient, userId: string) => {
  return await client.query.jutsuLoadout.findMany({
    where: eq(jutsuLoadout.userId, userId),
    orderBy: (table, { desc }) => desc(table.createdAt),
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
  // Fetch filtered data
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
  // Return in an optimized manner
  return userjutsus.map((result) => ({
    ...result.UserJutsu,
    jutsu: {
      ...result.Jutsu,
      bloodline: result.Bloodline,
    },
  }));
};

/**
 * Translates the input filtering schema into database filters.
 * @param input
 * @returns
 */
export const jutsuDatabaseFilter = (input?: JutsuFilteringSchema) => {
  return [
    ...(input?.name ? [like(jutsu.name, `%${input.name}%`)] : []),
    ...(input?.bloodline ? [eq(jutsu.bloodlineId, input.bloodline)] : []),
    ...(input?.requiredLevel ? [gte(jutsu.requiredLevel, input.requiredLevel)] : []),
    ...[
      input?.rank ? eq(jutsu.requiredRank, input.rank) : isNotNull(jutsu.requiredRank),
    ],
    ...[input?.rarity ? eq(jutsu.jutsuRank, input.rarity) : isNotNull(jutsu.jutsuRank)],
    ...(input?.appear
      ? [
          sql`JSON_SEARCH(${jutsu.effects},'one',${input.appear},NULL,'$[*].appearAnimation') IS NOT NULL`,
        ]
      : []),
    ...(input?.static
      ? [
          sql`JSON_SEARCH(${jutsu.effects},'one',${input.static},NULL,'$[*].staticAnimation') IS NOT NULL`,
        ]
      : []),
    ...(input?.disappear
      ? [
          sql`JSON_SEARCH(${jutsu.effects},'one',${input.disappear},NULL,'$[*].disappearAnimation') IS NOT NULL`,
        ]
      : []),
    ...(input?.classification
      ? [eq(jutsu.statClassification, input.classification)]
      : []),
    ...(input?.element && input.element.length > 0
      ? [
          and(
            ...input.element.map(
              (e) =>
                sql`JSON_SEARCH(${jutsu.effects},'one',${e},NULL,'$[*].elements') IS NOT NULL`,
            ),
          ),
        ]
      : []),
    ...[input?.method ? eq(jutsu.method, input.method) : isNotNull(jutsu.method)],
    ...(input?.stat && input.stat.length > 0
      ? [
          and(
            ...input.stat.map(
              (s) => sql`JSON_SEARCH(${jutsu.effects},'one',${s}) IS NOT NULL`,
            ),
          ),
        ]
      : []),
    ...(input?.effect && input.effect.length > 0
      ? [
          or(
            ...input.effect.map(
              (e) => sql`JSON_SEARCH(${jutsu.effects},'one',${e}) IS NOT NULL`,
            ),
          ),
        ]
      : []),
    ...[input?.target ? eq(jutsu.target, input.target) : isNotNull(jutsu.target)],
    ...(input?.hidden !== undefined
      ? [eq(jutsu.hidden, input.hidden)]
      : [eq(jutsu.hidden, false)]),
  ];
};
