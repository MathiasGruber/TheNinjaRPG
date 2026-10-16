import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { HOME_FURNITURE_STARTERS } from "@/drizzle/constants";
import { userData, userItem } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";

/** Grant the initial fixtures once, then preserve removals even before the first home visit. */
export const initializeStarterHomeItems = async (
  client: DrizzleClient,
  userId: string,
) => {
  await client.insert(userItem).values(
    HOME_FURNITURE_STARTERS.map(({ itemId, x, y }): typeof userItem.$inferInsert => ({
      id: nanoid(),
      userId,
      itemId,
      quantity: 1,
      equipped: "NONE",
      storedAtHome: true,
      homeX: x,
      homeY: y,
      homeRotation: 0,
    })),
  );
  await client
    .update(userData)
    .set({ homeFurnitureRevision: 1 })
    .where(and(eq(userData.userId, userId), eq(userData.homeFurnitureRevision, 0)));
};
