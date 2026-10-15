import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { actionLog } from "@/drizzle/schema";
import { errorResponse } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import {
  cacheConsumptionReceiptSchema,
  type cacheConsumptionResponseSchema,
} from "@/validators/weightedCache";

export const cacheReceiptId = (userId: string, requestId: string) =>
  `cache:${createHash("sha256")
    .update(JSON.stringify([userId, requestId]))
    .digest("hex")}`;

export const readCacheReceipt = (changes: unknown, userItemId: string) => {
  let receipt: unknown;
  try {
    receipt =
      Array.isArray(changes) && typeof changes[0] === "string"
        ? JSON.parse(changes[0])
        : undefined;
  } catch {
    return errorResponse("Could not read the opening receipt. Please contact staff.");
  }
  const parsed = cacheConsumptionReceiptSchema.safeParse(receipt);
  return parsed.success && parsed.data.userItemId === userItemId
    ? parsed.data.response
    : errorResponse("This opening request was already used for another item");
};

/** Claim, effects, grants, audit and the replayable response share one commit. */
export const commitCacheConsumption = async ({
  client,
  receiptId,
  userId,
  userItemId,
  itemId,
  selections,
  consume,
}: {
  client: DrizzleClient;
  receiptId: string;
  userId: string;
  userItemId: string;
  itemId: string;
  selections: unknown;
  consume: (
    client: DrizzleClient,
  ) => Promise<
    z.infer<typeof cacheConsumptionResponseSchema> | ReturnType<typeof errorResponse>
  >;
}) =>
  retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      // The unique receipt serializes retries before they can claim a second stack unit.
      const claimed = await tx.insert(actionLog).ignore().values({
        id: receiptId,
        userId,
        tableName: "userItem",
        relatedId: itemId,
        relatedMsg: "WeightedCacheOpening",
        changes: [],
      });
      if (claimed.rowsAffected === 0) {
        const receipt = await tx.query.actionLog.findFirst({
          where: eq(actionLog.id, receiptId),
        });
        return readCacheReceipt(receipt?.changes, userItemId);
      }
      const response = await consume(tx as unknown as DrizzleClient);
      if (!response.success) {
        await tx.delete(actionLog).where(eq(actionLog.id, receiptId));
        return response;
      }
      await tx
        .update(actionLog)
        // ActionLog readers expect string arrays; the receipt retains its structured payload as JSON.
        .set({ changes: [JSON.stringify({ userItemId, response, selections })] })
        .where(eq(actionLog.id, receiptId));
      return response;
    }),
  );
