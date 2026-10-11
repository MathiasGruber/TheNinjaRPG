import { eq, sql } from "drizzle-orm";
import { PVP_EXPERIENCE_AVERAGE_SETTING } from "@/drizzle/constants";
import type { GameSetting } from "@/drizzle/schema";
import { userData } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { scopedRead } from "@/server/requestScope";

/** Share the indexed population average across a tRPC batch; AI templates are excluded. */
export const fetchPvpExperienceAverage = (
  client: Pick<DrizzleClient, "select">,
): Promise<GameSetting> =>
  scopedRead("pvpExperienceAverage", async () => {
    const [row] = await client
      .select({
        average: sql<number>`COALESCE(AVG(${userData.pvpExperience}), 0)`.mapWith(
          Number,
        ),
      })
      .from(userData)
      .where(eq(userData.isAi, false));
    return {
      id: PVP_EXPERIENCE_AVERAGE_SETTING,
      name: PVP_EXPERIENCE_AVERAGE_SETTING,
      value: row?.average ?? 0,
      time: new Date(),
    };
  });
