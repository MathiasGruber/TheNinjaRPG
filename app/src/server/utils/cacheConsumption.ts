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

/** Namespace a retry identity by account so another user cannot replay its receipt. */
export const cacheReceiptId = (userId: string, requestId: string) =>
  `cache:${createHash("sha256")
    .update(JSON.stringify([userId, requestId]))
    .digest("hex")}`;

/** Decode an audit receipt and reject reuse of its request ID for a different stack. */
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

/**
 * Commit an item debit, all grants/effects and its replay receipt atomically.
 * Collection grants and bundles insert rows, so a single guarded UPDATE cannot
 * preserve this invariant. Validate configurations and select outcomes beforehand;
 * consume must use the supplied client and remain safe to rerun after a deadlock.
 * Return success:false only before side effects; throw after a mutation to roll back.
 */
export const commitCacheConsumption = async ({
  client,
  receiptId,
  userId,
  userItemId,
  itemId,
  selections,
  relatedMsg = "WeightedCacheOpening",
  consume,
}: {
  client: DrizzleClient;
  receiptId: string;
  userId: string;
  userItemId: string;
  itemId: string;
  selections: unknown;
  relatedMsg?: string;
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
        relatedMsg,
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
