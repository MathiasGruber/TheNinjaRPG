import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { conversation, user2conversation } from "@/drizzle/schema";
import { errorResponse } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";

/**
 * Own the reserve → initiate → publish/recover sequence for both co-op activities.
 * Adapter reservations and compensation are scoped to this unique claim; a losing CAS
 * never starts combat. Each adapter compensates its own committed writes.
 */
export const launchCoopEncounter = async <
  T extends { success: boolean; message: string; battleId?: string },
>({
  reserve,
  initiate,
  publish,
  recover,
}: {
  reserve: (claimId: string) => Promise<boolean>;
  initiate: (claimId: string) => Promise<T>;
  publish?: (claimId: string, result: T) => Promise<void>;
  recover: (claimId: string) => Promise<void>;
}) => {
  const claimId = `claiming:${Date.now()}:${nanoid()}`;
  if (!(await reserve(claimId)))
    return errorResponse("The party changed. Refresh and try again.");
  let result: T;
  try {
    result = await initiate(claimId);
    if (result.success) await publish?.(claimId, result);
  } catch (error) {
    await recover(claimId);
    throw error;
  }
  if (!result.success) await recover(claimId);
  return result;
};

/** Upsert the existing private conversation and its membership without changing chat permissions. */
export const joinCoopChat = async (
  client: DrizzleClient,
  partyId: string,
  title: string,
  userId: string,
) => {
  await Promise.all([
    client
      .insert(conversation)
      .values({
        id: partyId,
        title,
        createdById: userId,
        isPublic: false,
        isEnabled: true,
      })
      .onDuplicateKeyUpdate({ set: { id: sql`id` } }),
    client
      .insert(user2conversation)
      .values({ conversationId: partyId, userId })
      .onDuplicateKeyUpdate({ set: { conversationId: sql`conversationId` } }),
  ]);
};

export const leaveCoopChat = (client: DrizzleClient, partyId: string, userId: string) =>
  client
    .delete(user2conversation)
    .where(
      and(
        eq(user2conversation.conversationId, partyId),
        eq(user2conversation.userId, userId),
      ),
    );
