import { expect, it } from "bun:test";
import { userQueue } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { type QueuedCraft, settleCraftingQueue } from "@/server/utils/userQueue";

it("reschedules remaining crafts without overlapping statements on the transaction", async () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const activeFinish = new Date(now.getTime() + 60_000);
  const writes: { startsAt: Date; finishesAt: Date }[] = [];
  let inFlight = false;
  let committed = false;
  const rows = [1, 2].map((position) => ({
    id: `craft-${position}`,
    userId: "owner",
    kind: "CRAFT",
    position,
    createdAt: now,
    energy: null,
    jutsuId: null,
    reservedRyo: null,
    stat: null,
    speed: null,
    itemId: "item",
    quantity: 1,
    materials: [],
    durationSeconds: 60,
    startsAt: new Date(now.getTime() + (position - 1) * 60_000),
    finishesAt: new Date(now.getTime() + position * 60_000),
    item: null,
  })) as QueuedCraft[];
  const select = (value: unknown[]) => ({ from: () => ({ where: async () => value }) });
  const tx = {
    select: () => select([{ finish: activeFinish }]),
    update: (table: unknown) => ({
      set: (values: { startsAt: Date; finishesAt: Date }) => ({
        where: async () => {
          if (table !== userQueue) return { rowsAffected: 1 };
          if (inFlight) throw new Error("transaction in use: for query");
          inFlight = true;
          await new Promise<void>((resolve) => setTimeout(resolve, 1));
          writes.push(values);
          inFlight = false;
          return { rowsAffected: 1 };
        },
      }),
    }),
  };
  const client = {
    // Upfront snapshot misses a craft started by another request. The locked reread
    // sees it, so both waiting jobs must move behind its deadline in this transaction.
    select: () => select([]),
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      const result = await callback(tx);
      committed = true;
      return result;
    },
  } as unknown as DrizzleClient;
  expect(await settleCraftingQueue(client, "owner", now, rows)).toBe(0);
  expect(committed).toBe(true);
  expect(writes).toEqual([
    { startsAt: activeFinish, finishesAt: new Date(now.getTime() + 120_000) },
    {
      startsAt: new Date(now.getTime() + 120_000),
      finishesAt: new Date(now.getTime() + 180_000),
    },
  ]);
});
