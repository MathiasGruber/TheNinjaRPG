import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { quest, userData, village } from "@/drizzle/schema";
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
import { getRandomElement } from "@/utils/array";
import { idSchema } from "@/validators/misc";
import {
  type VillageMission,
  villageMissionActionSchema,
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
      if (villageData.kageId !== ctx.userId)
        return errorResponse("Only the Kage can select a Village Mission");
      if (user.isBanned) return errorResponse("You are banned");
      const current = villageData.activeMission;
      if (input.missionId) {
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
        rewardTokens: candidate.content.reward.reward_tokens,
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
            leaderGuard(input.villageId, ctx.userId),
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
      const result = await ctx.drizzle
        .update(village)
        .set({
          tokens: sql`${village.tokens} + ${mission.rewardTokens}`,
          activeMission: null,
        })
        .where(
          and(
            leaderGuard(input.villageId, ctx.userId),
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
        message: `${mission.rewardTokens.toLocaleString()} tokens awarded to the village`,
      };
    }),
});

const leaderGuard = (villageId: string, userId: string) =>
  and(
    eq(village.id, villageId),
    eq(village.kageId, userId),
    eq(village.type, "VILLAGE"),
    sql`EXISTS (SELECT 1 FROM ${userData} WHERE ${userData.userId} = ${userId} AND ${userData.villageId} = ${village.id} AND ${userData.isOutlaw} = false AND ${userData.isBanned} = false)`,
  );
