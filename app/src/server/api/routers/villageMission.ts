import { and, eq, exists, gte, isNull, ne, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { quest, userData, village } from "@/drizzle/schema";
import { collapseRewards } from "@/libs/rewards";
import { getVillageLoyaltyBonuses, percentageMultiplier } from "@/libs/villageLoyalty";
import {
  getVillageMissionProgress,
  isVillageMissionAvailable,
} from "@/libs/villageMission";
import { fetchUser } from "@/routers/profile";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { getRandomElement } from "@/utils/array";
import { isStaffRole } from "@/utils/permissions";
import { idSchema } from "@/validators/misc";
import {
  type VillageMission,
  villageMissionActionSchema,
  villageMissionCancelSchema,
  villageMissionObjectiveSchema,
} from "@/validators/villageMission";

export const villageMissionRouter = createTRPCRouter({
  get: protectedProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const [user, villageData] = await Promise.all([
      fetchUser(ctx.drizzle, ctx.userId),
      ctx.drizzle.query.village.findFirst({ where: eq(village.id, input.id) }),
    ]);
    if (
      !villageData ||
      user.villageId !== input.id ||
      user.isOutlaw ||
      villageData.type !== "VILLAGE"
    )
      return null;
    return {
      mission: getVillageMissionProgress(villageData),
      isKage: villageData.kageId === ctx.userId,
      isStaff: isStaffRole(user.role) && !user.isBanned,
    };
  }),
  select: protectedProcedure
    .input(villageMissionActionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, villageData, candidates] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.village.findFirst({ where: eq(village.id, input.villageId) }),
        ctx.drizzle.query.quest.findMany({
          where: eq(quest.questType, "village_mission"),
        }),
      ]);
      if (
        !villageData ||
        villageData.type !== "VILLAGE" ||
        user.villageId !== input.villageId ||
        user.isOutlaw
      )
        return errorResponse("You must belong to this village");
      if (villageData.kageId !== ctx.userId && !isStaffRole(user.role))
        return errorResponse("Only the Kage or staff can select a Village Mission");
      if (user.isBanned) return errorResponse("You are banned");
      const current = villageData.activeMission;
      if (input.missionId) {
        if (villageData.kageId !== ctx.userId)
          return errorResponse("Only the Kage can reroll a Village Mission");
        if (!current || current.id !== input.missionId)
          return errorResponse("The Village Mission changed; refresh and try again");
        if (current.rerolled)
          return errorResponse("This Village Mission has already been rerolled");
      } else if (current)
        return errorResponse("Your village already has an active Village Mission");
      const candidate = getRandomElement(
        candidates.filter(
          (entry) =>
            entry.id !== current?.questId &&
            isVillageMissionAvailable(entry, villageData.id),
        ),
      );
      if (!candidate)
        return errorResponse(
          current
            ? "No different Village Mission is available"
            : "No Village Missions are available. Ask staff to add missions in the quest editor.",
        );
      const mission: VillageMission = {
        id: nanoid(),
        questId: candidate.id,
        name: candidate.name,
        description: candidate.description,
        rewardTokens: collapseRewards([
          candidate.content.reward,
          ...(candidate.content.reward.reward_packages ?? []).map(
            (pack) => pack.rewards,
          ),
        ]).reward_tokens,
        objectives: candidate.content.objectives.map((objective) =>
          villageMissionObjectiveSchema.parse(objective),
        ),
        baseline: {},
        rerolled: !!current,
        startedAt: new Date().toISOString(),
      };
      const result = await ctx.drizzle
        .update(village)
        .set({
          // Copy counters inside the statement so contributions racing selection belong to exactly one mission.
          activeMission: sql`JSON_SET(${JSON.stringify(mission)}, '$.baseline', ${village.missionCounters})`,
        })
        .where(
          and(
            leaderGuard(ctx.drizzle, input.villageId, ctx.userId, !input.missionId),
            current
              ? and(
                  sql`JSON_UNQUOTE(JSON_EXTRACT(${village.activeMission}, '$.id')) = ${current.id}`,
                  sql`JSON_EXTRACT(${village.activeMission}, '$.rerolled') = false`,
                )
              : isNull(village.activeMission),
          ),
        );
      if (result.rowsAffected === 0)
        return errorResponse(
          "Village leadership or mission changed; refresh and try again",
        );
      return {
        success: true,
        message: current
          ? "Village Mission rerolled. Progress starts again for the new mission."
          : "Village Mission selected",
      };
    }),
  cancel: protectedProcedure
    .input(villageMissionCancelSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!isStaffRole(user.role))
        return errorResponse("Only staff can cancel a Village Mission");
      if (user.isBanned) return errorResponse("You are banned");
      if (user.villageId !== input.villageId || user.isOutlaw)
        return errorResponse("You must belong to this village");
      const result = await ctx.drizzle
        .update(village)
        .set({ activeMission: null })
        .where(
          and(
            leaderGuard(ctx.drizzle, input.villageId, ctx.userId, true),
            sql`JSON_UNQUOTE(JSON_EXTRACT(${village.activeMission}, '$.id')) = ${input.missionId}`,
            exists(
              ctx.drizzle
                .select({ userId: userData.userId })
                .from(userData)
                .where(and(eq(userData.userId, ctx.userId), ne(userData.role, "USER"))),
            ),
          ),
        );
      if (result.rowsAffected === 0)
        return errorResponse(
          "Village membership or mission changed; refresh and try again",
        );
      return {
        success: true,
        message:
          "Village Mission cancelled without penalty. A new mission can be selected immediately.",
      };
    }),
  claim: protectedProcedure
    .input(villageMissionActionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, villageData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.village.findFirst({ where: eq(village.id, input.villageId) }),
      ]);
      if (
        !villageData ||
        villageData.kageId !== ctx.userId ||
        user.villageId !== input.villageId ||
        user.isOutlaw ||
        villageData.type !== "VILLAGE"
      )
        return errorResponse("Only this village's Kage can claim the reward");
      if (user.isBanned) return errorResponse("You are banned");
      const mission = getVillageMissionProgress(villageData);
      if (!mission || mission.id !== input.missionId)
        return errorResponse("The Village Mission changed; refresh and try again");
      if (!mission.completed)
        return errorResponse("Complete every Village Mission objective first");
      const rewardTokens =
        mission.rewardTokens > 0
          ? Math.round(
              mission.rewardTokens *
                percentageMultiplier(getVillageLoyaltyBonuses(user).villageRewards),
            )
          : mission.rewardTokens;
      const result = await ctx.drizzle
        .update(village)
        .set({
          tokens: sql`${village.tokens} + ${rewardTokens}`,
          activeMission: null,
        })
        .where(
          and(
            leaderGuard(ctx.drizzle, input.villageId, ctx.userId),
            sql`JSON_UNQUOTE(JSON_EXTRACT(${village.activeMission}, '$.id')) = ${mission.id}`,
            ...mission.objectives.map((objective) =>
              gte(
                sql`COALESCE(JSON_EXTRACT(${village.missionCounters}, ${`$.${objective.task}`}), 0) - COALESCE(JSON_EXTRACT(${village.activeMission}, ${`$.baseline.${objective.task}`}), 0)`,
                objective.value,
              ),
            ),
          ),
        );
      if (result.rowsAffected === 0)
        return errorResponse(
          "Village leadership or mission changed; refresh and try again",
        );
      return {
        success: true,
        message: `${rewardTokens.toLocaleString()} tokens awarded to the village`,
      };
    }),
});

const leaderGuard = (
  client: Pick<DrizzleClient, "select">,
  villageId: string,
  userId: string,
  allowStaff = false,
) =>
  and(
    eq(village.id, villageId),
    allowStaff
      ? or(
          eq(village.kageId, userId),
          exists(
            client
              .select({ userId: userData.userId })
              .from(userData)
              .where(and(eq(userData.userId, userId), ne(userData.role, "USER"))),
          ),
        )
      : eq(village.kageId, userId),
    eq(village.type, "VILLAGE"),
    exists(
      client
        .select({ userId: userData.userId })
        .from(userData)
        .where(
          and(
            eq(userData.userId, userId),
            eq(userData.villageId, village.id),
            eq(userData.isOutlaw, false),
            eq(userData.isBanned, false),
          ),
        ),
    ),
  );
