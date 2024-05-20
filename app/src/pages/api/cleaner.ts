import { TRPCError } from "@trpc/server";
import { and, lte, sql, eq, lt, isNull } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userData, battle, dataBattleAction, userJutsu, jutsu } from "@/drizzle/schema";
import { battleHistory, battleAction, historicalAvatar, clan } from "@/drizzle/schema";
import { conversation, user2conversation, conversationComment } from "@/drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { secondsFromNow } from "@/utils/time";
import type { NextApiRequest, NextApiResponse } from "next";

const cleanDatabase = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    // Step 1: Delete from battle table where updatedAt is older than 1 day
    await drizzleDB
      .delete(battle)
      .where(lte(battle.updatedAt, new Date(Date.now() - 1000 * 60 * 60 * 24)));

    // Step 2: Update users who are in battle where the battle no longer exists to be awake and not in battle
    await drizzleDB.execute(
      sql`UPDATE ${userData} a SET a.battleId=NULL, a.status="AWAKE", a.travelFinishAt=NULL WHERE NOT EXISTS (SELECT id FROM ${battle} b WHERE b.id = a.battleId) AND a.battleId IS NOT NULL`,
    );

    // Step 3: Delete from battle action where battles have been deleted
    await drizzleDB.execute(
      sql`DELETE FROM ${battleAction} a WHERE 
          NOT EXISTS (SELECT id FROM ${battle} b WHERE b.id = a.battleId) AND
          createdAt < DATE_SUB(NOW(), INTERVAL ${3600 * 3} SECOND)`,
    );

    // One day in mseconds
    const oneDay = 1000 * 60 * 60 * 24;

    // Step 4: Delete battle actions older than 7 days
    await drizzleDB
      .delete(dataBattleAction)
      .where(lte(dataBattleAction.createdAt, new Date(Date.now() - oneDay * 7)));

    // Step 5: Delete battle history older than 1 day
    await drizzleDB
      .delete(battleHistory)
      .where(lte(battleHistory.createdAt, new Date(Date.now() - oneDay * 1)));

    // Step 6: Delete conversations older than 14 days
    await drizzleDB
      .delete(conversation)
      .where(
        and(
          lte(conversation.updatedAt, new Date(Date.now() - oneDay * 14)),
          eq(conversation.isPublic, 0),
        ),
      );

    // Step 7: Conversation comments where the conversation does not exist anymore
    await drizzleDB.execute(
      sql`DELETE FROM ${conversationComment} a WHERE NOT EXISTS (SELECT id FROM ${conversation} b WHERE b.id = a.conversationId)`,
    );

    // Step 8: Delete conversation comments older than 14 days
    await drizzleDB
      .delete(conversationComment)
      .where(lte(conversationComment.createdAt, new Date(Date.now() - oneDay * 14)));

    // Step 9: Delete user2conversation where the conversation does not exist anymore
    await drizzleDB.execute(
      sql`DELETE FROM ${user2conversation} a WHERE NOT EXISTS (SELECT id FROM ${conversation} b WHERE b.id = a.conversationId)`,
    );

    // Step 10: Remove user jutsus where the jutsu ID no longer exists
    await drizzleDB.execute(
      sql`DELETE FROM ${userJutsu} a WHERE NOT EXISTS (SELECT id FROM ${jutsu} b WHERE b.id = a.jutsuId)`,
    );

    // Step 11: Clearing historical avatars that failed more than 3 hours ago
    await drizzleDB
      .delete(historicalAvatar)
      .where(
        and(
          lt(historicalAvatar.createdAt, secondsFromNow(-3600 * 3)),
          isNull(historicalAvatar.avatar),
        ),
      );

    // Step 12: Update users who have a clanId by no clan
    await drizzleDB.execute(
      sql`UPDATE ${userData} a SET a.clanId=NULL WHERE NOT EXISTS (SELECT id FROM ${clan} b WHERE b.id = a.battleId) AND a.battleId IS NOT NULL`,
    );

    res.status(200).json("OK");
  } catch (cause) {
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    // Another error occured
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default cleanDatabase;
