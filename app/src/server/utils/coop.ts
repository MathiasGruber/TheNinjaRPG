import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  battle,
  battleHistory,
  conversation,
  user2conversation,
  userData,
} from "@/drizzle/schema";
import { errorResponse } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/**
 * Allocate the battle ID before reserving either co-op activity, then initiate and publish.
 * Adapter reservations and compensation are scoped to this unique claim; a losing CAS
 * never starts combat. Initiation failures compensate only this launch; publication failures
 * retain the active reservation so another encounter cannot overlap it.
 */
export const launchCoopEncounter = async <
  T extends { success: boolean; message: string; battleId?: string },
>({
  reserve,
  initiate,
  publish,
  recover,
}: {
  reserve: (launch: CoopLaunch) => Promise<boolean>;
  initiate: (launch: CoopLaunch) => Promise<T>;
  publish?: (launch: CoopLaunch, result: T) => Promise<void>;
  recover: (launch: CoopLaunch) => Promise<void>;
}) => {
  const battleId = nanoid();
  const launch = { battleId, claimId: `claiming:${Date.now()}:${battleId}` };
  if (!(await reserve(launch)))
    return errorResponse("The party changed. Refresh and try again.");
  let result: T;
  try {
    result = await initiate(launch);
  } catch (error) {
    await recover(launch);
    throw error;
  }
  if (!result.success) await recover(launch);
  // The battle is committed now. Keep its reservation if publication fails; reads reconcile it.
  else await publish?.(launch, result);
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

/** Idempotently revoke this member's conversation access after preserving their quest progress. */
export const leaveCoopChat = (client: DrizzleClient, partyId: string, userId: string) =>
  client
    .delete(user2conversation)
    .where(
      and(
        eq(user2conversation.conversationId, partyId),
        eq(user2conversation.userId, userId),
      ),
    );

/** Compensate a failed start before reopening its party; a newer battle has a different ID. */
export const cleanupCoopBattleStart = async (
  client: DrizzleClient,
  battleId: string,
  memberIds: string[],
) =>
  retryOnDeadlock(async () => {
    await client.delete(battle).where(eq(battle.id, battleId));
    const cleanup = await Promise.allSettled([
      client.delete(battleHistory).where(eq(battleHistory.battleId, battleId)),
      client
        .update(userData)
        .set({ status: "AWAKE", battleId: null, updatedAt: new Date() })
        .where(
          and(inArray(userData.userId, memberIds), eq(userData.battleId, battleId)),
        ),
    ]);
    const failure = cleanup.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  });

type CoopLaunch = { claimId: string; battleId: string };
