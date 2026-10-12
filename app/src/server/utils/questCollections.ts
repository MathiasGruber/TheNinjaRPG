import { and, eq, isNotNull } from "drizzle-orm";
import { bloodline, bloodlineRolls } from "@/drizzle/schema";
import { buildBloodlineCollectionProgress } from "@/libs/bloodline";
import { getUserQuests } from "@/libs/quest";
import type { UserWithRelations } from "@/routers/profile";
import type { DrizzleClient } from "@/server/db";
import { getFarmCollectionCount } from "@/server/utils/farming";

/** Load collection snapshots only for unfinished collection goals of active quests. */
export const hydrateQuestCollections = async (
  client: DrizzleClient,
  user: NonNullable<UserWithRelations>,
  inTransaction = false,
) => {
  const objectives = getUserQuests(user).flatMap((quest) =>
    quest.content.objectives.filter(
      (objective) =>
        !(user.questData ?? [])
          .find((tracker) => tracker.id === quest.id)
          ?.goals.find((goal) => goal.id === objective.id)?.done,
    ),
  );
  const hasFarming = objectives.some((o) => o.task === "farming_collection_log");
  const hasBloodlines = objectives.some((o) => o.task === "bloodline_collection");
  const queries = [
    hasFarming ? getFarmCollectionCount(client, user.userId, inTransaction) : undefined,
    hasBloodlines
      ? client.query.bloodline.findMany({
          columns: { id: true, rank: true, hidden: true },
          where: eq(bloodline.hidden, false),
        })
      : undefined,
    hasBloodlines
      ? client.query.bloodlineRolls.findMany({
          columns: { bloodlineId: true },
          where: and(
            eq(bloodlineRolls.userId, user.userId),
            isNotNull(bloodlineRolls.bloodlineId),
          ),
        })
      : undefined,
  ] as const;
  const [farmingCollectionCount, catalogue, rolls] = inTransaction
    ? [await queries[0], await queries[1], await queries[2]]
    : await Promise.all(queries);
  return {
    ...user,
    farmingCollectionCount,
    bloodlineCollectionProgress:
      catalogue && rolls
        ? buildBloodlineCollectionProgress(catalogue, [
            ...rolls.flatMap((roll) => (roll.bloodlineId ? [roll.bloodlineId] : [])),
            ...(user.bloodlineId ? [user.bloodlineId] : []),
          ])
        : undefined,
  };
};
