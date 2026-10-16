import { nanoid } from "nanoid";
import { HOME_FURNITURE_STARTERS } from "@/drizzle/constants";
import type { userItem } from "@/drizzle/schema";

/** Starter fixtures are ordinary owned items, initially placed in home storage. */
export const createStarterHomeItems = (
  userId: string,
): (typeof userItem.$inferInsert)[] =>
  HOME_FURNITURE_STARTERS.map(({ itemId, x, y }) => ({
    id: nanoid(),
    userId,
    itemId,
    quantity: 1,
    equipped: "NONE",
    storedAtHome: true,
    homeX: x,
    homeY: y,
    homeRotation: 0,
  }));
