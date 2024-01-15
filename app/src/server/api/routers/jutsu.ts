import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, inArray, isNotNull, sql, and, gte, ne, like } from "drizzle-orm";
import { jutsu, userJutsu, userData, actionLog } from "@/drizzle/schema";
import { LetterRanks } from "@/drizzle/constants";
import { fetchUser, fetchRegeneratedUser } from "./profile";
import { canTrainJutsu } from "@/libs/train";
import { getNewTrackers } from "@/libs/quest";
import { calcJutsuTrainTime, calcJutsuTrainCost } from "@/libs/train";
import { calcJutsuEquipLimit, calcForgetReturn } from "@/libs/train";
import { JutsuValidator, animationNames } from "@/libs/combat/types";
import { canChangeContent } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import { createTRPCRouter } from "@/server/api/trpc";
import { protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { serverError, baseServerResponse } from "@/server/api/trpc";
import { statFilters, effectFilters } from "@/libs/train";
import HumanDiff from "human-object-diff";
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
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
        hideAi: z.boolean().optional(),
        rarity: z.enum(LetterRanks).optional(),
        bloodline: z.string().optional(),
        stat: z.enum(statFilters).optional(),
        effect: z.string().optional(),
        appear: z.enum(animationNames).optional(),
        static: z.enum(animationNames).optional(),
        disappear: z.enum(animationNames).optional(),
        name: z.string().min(0).max(256).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.effect && !(effectFilters as string[]).includes(input.effect)) {
        throw serverError("PRECONDITION_FAILED", `Invalid filter: ${input.effect}`);
      }
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.jutsu.findMany({
        where: and(
          ...[
            input.rarity
              ? eq(jutsu.jutsuRank, input.rarity)
              : isNotNull(jutsu.jutsuRank),
          ],
          ...(input.bloodline ? [eq(jutsu.bloodlineId, input.bloodline)] : []),
          ...(input.name ? [like(jutsu.name, `%${input.name}%`)] : []),
          ...(input.hideAi ? [ne(jutsu.jutsuType, "AI")] : []),
          ...(input.stat
            ? [sql`JSON_SEARCH(${jutsu.effects},'one',${input.stat}) IS NOT NULL`]
            : []),
          ...(input.effect
            ? [sql`JSON_SEARCH(${jutsu.effects},'one',${input.effect}) IS NOT NULL`]
            : []),
          ...(input.appear
            ? [
                sql`JSON_SEARCH(${jutsu.effects},'one',${input.appear},NULL,'$[*].appearAnimation') IS NOT NULL`,
              ]
            : []),
          ...(input.static
            ? [
                sql`JSON_SEARCH(${jutsu.effects},'one',${input.static},NULL,'$[*].staticAnimation') IS NOT NULL`,
              ]
            : []),
          ...(input.disappear
            ? [
                sql`JSON_SEARCH(${jutsu.effects},'one',${input.disappear},NULL,'$[*].disappearAnimation') IS NOT NULL`,
              ]
            : [])
        ),
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
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  // Create new jutsu
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(jutsu).values({
        id: id,
        name: "New Jutsu",
        description: "New jutsu description",
        battleDescription: "%user uses %jutsu on %target",
        effects: [],
        range: 1,
        requiredRank: "STUDENT",
        target: "OTHER_USER",
        jutsuType: "AI",
        image: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
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
          const cost = calcForgetReturn(userjutsu.jutsu, userjutsu.level);
          const res2 = await ctx.drizzle
            .update(userData)
            .set({ money: sql`${userData.money} + ${cost}` })
            .where(eq(userData.userId, ctx.userId));
          if (res2.rowsAffected === 1) {
            return { success: true, message: `Jutsu forgotten, ${cost} ryo restored` };
          }
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
        const diff = new HumanDiff({ objectName: "jutsu" }).diff(entry, {
          id: entry.id,
          updatedAt: entry.updatedAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update database
        await ctx.drizzle.update(jutsu).set(input.data).where(eq(jutsu.id, input.id));
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "jutsu",
          changes: diff,
          relatedId: entry.id,
          relatedMsg: `Update: ${entry.name}`,
          relatedImage: entry.image,
        });
        if (process.env.NODE_ENV !== "development") {
          await callDiscordContent(user.username, entry.name, diff, entry.image);
        }
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit jutsu` };
      }
    }),
  // Get all uset jutsu
  getUserJutsus: protectedProcedure.query(async ({ ctx }) => {
    const [user, results] = await Promise.all([
      fetchUser(ctx.drizzle, ctx.userId),
      fetchUserJutsus(ctx.drizzle, ctx.userId),
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
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchRegeneratedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      const info = await fetchJutsu(ctx.drizzle, input.jutsuId);
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const userjutsu = userjutsus.find((j) => j.jutsuId === input.jutsuId);
      if (!user) {
        return { success: false, message: "User not found" };
      }
      if (!info) {
        return { success: false, message: "Jutsu not found" };
      }
      if (info.hidden === 1) {
        return { success: false, message: "Jutsu can not be trained" };
      }
      if (!canTrainJutsu(info, user)) {
        return { success: false, message: "You cannot train this jutsu" };
      }
      if (user.status !== "AWAKE") {
        return { success: false, message: "Must be awake to start training jutsu" };
      }
      if (userjutsus.find((j) => j.finishTraining && j.finishTraining > new Date())) {
        return { success: false, message: "You are already training a jutsu" };
      }
      const level = userjutsu ? userjutsu.level : 0;
      const trainTime = calcJutsuTrainTime(info, level);
      const trainCost = calcJutsuTrainCost(info, level);

      let questData = user.questData;
      if (!userjutsu) {
        const { trackers } = getNewTrackers(user, [
          { task: "jutsus_mastered", increment: 1 },
        ]);
        questData = trackers;
      }

      const moneyUpdate = await ctx.drizzle
        .update(userData)
        .set({ money: sql`${userData.money} - ${trainCost}`, questData: questData })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, trainCost)));
      if (moneyUpdate.rowsAffected !== 1) {
        return { success: false, message: "You don't have enough money" };
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
        });
      }
      return { success: true, message: `You started training: ${info.name}` };
    }),
  // Toggle whether an item is equipped
  toggleEquip: protectedProcedure
    .input(z.object({ userJutsuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const filteredJutsus = userjutsus.filter((userjutsu) => {
        return (
          userjutsu.jutsu?.bloodlineId === "" ||
          user.bloodlineId === userjutsu.jutsu?.bloodlineId
        );
      });
      const userjutsu = filteredJutsus.find((j) => j.id === input.userJutsuId);
      const isEquipped = userjutsu?.equipped || false;
      const curEquip = filteredJutsus?.filter((j) => j.equipped).length || 0;
      const maxEquip = userData && calcJutsuEquipLimit(user);
      if (!userjutsu) {
        throw serverError("NOT_FOUND", "Jutsu not found");
      }
      if (!isEquipped && curEquip >= maxEquip) {
        throw serverError("PRECONDITION_FAILED", "You cannot equip more jutsu");
      }
      return await ctx.drizzle
        .update(userJutsu)
        .set({
          equipped: userjutsu.equipped === 0 ? 1 : 0,
        })
        .where(eq(userJutsu.id, input.userJutsuId));
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchJutsu = async (client: DrizzleClient, id: string) => {
  return await client.query.jutsu.findFirst({
    where: eq(jutsu.id, id),
  });
};

export const fetchUserJutsus = async (client: DrizzleClient, userId: string) => {
  const userjutsus = await client.query.userJutsu.findMany({
    with: {
      jutsu: {
        with: {
          bloodline: true,
        },
      },
    },
    where: eq(userJutsu.userId, userId),
  });
  // CORRECTOR START: This code fixes if anyone has an AI jutsu equipped
  const equippedAiJutsus = userjutsus
    .filter((j) => j.jutsu?.jutsuType === "AI" && j.equipped === 1)
    .map((j) => j.jutsuId);
  if (equippedAiJutsus.length > 0) {
    await client
      .update(userJutsu)
      .set({ equipped: 0 })
      .where(
        and(eq(userJutsu.userId, userId), inArray(userJutsu.jutsuId, equippedAiJutsus))
      );
  }
  // CORRECTOR END: This code fixes if anyone has an AI jutsu equipped
  return userjutsus.filter((userjutsu) => userjutsu.jutsu?.jutsuType !== "AI");
};
