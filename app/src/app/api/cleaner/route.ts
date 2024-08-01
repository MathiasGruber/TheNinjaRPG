import { TRPCError } from "@trpc/server";
import { and, lte, sql, eq, lt, isNull } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { forumPost, forumThread, questHistory, userAttribute } from "@/drizzle/schema";
import { bankTransfers, bloodlineRolls, conceptImage } from "@/drizzle/schema";
import { userData, battle, dataBattleAction, userJutsu, jutsu } from "@/drizzle/schema";
import { userItem } from "@/drizzle/schema";
import { battleHistory, battleAction, historicalAvatar, clan } from "@/drizzle/schema";
import { conversation, user2conversation, conversationComment } from "@/drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { secondsFromNow } from "@/utils/time";
import { updateGameSetting, checkGameTimer } from "@/libs/gamesettings";

export async function GET() {
  // Check timer
  const frequency = 1;
  const response = await checkGameTimer(frequency);
  if (response) return response;

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
          createdAt < DATE_SUB(NOW(), INTERVAL ${3600 * 3} SECOND) LIMIT 99999`,
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
      sql`UPDATE ${userData} a SET a.clanId=NULL WHERE NOT EXISTS (SELECT id FROM ${clan} b WHERE b.id = a.clanId) AND a.clanId IS NOT NULL`,
    );

    // Step 3: Bank transfers from deleted users
    await drizzleDB.execute(
      sql`DELETE FROM ${bankTransfers} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.senderId)`,
    );
    await drizzleDB.execute(
      sql`DELETE FROM ${bankTransfers} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.receiverId)`,
    );

    // Step 13: Clear users older than 60 days
    await drizzleDB.execute(
      sql`DELETE FROM ${userData} WHERE experience < 100 AND isAi = 0 AND updatedAt < CURRENT_TIMESTAMP(3) - INTERVAL 30 DAY AND reputationPointsTotal <= 5`,
    );
    await drizzleDB.execute(
      sql`DELETE FROM ${userData} WHERE experience < 10000 AND isAi = 0 AND updatedAt < CURRENT_TIMESTAMP(3) - INTERVAL 60 DAY AND reputationPointsTotal <= 5`,
    );

    // Step 14: Clear bloodline rolls older than 1 day
    await drizzleDB.execute(
      sql`DELETE FROM ${bloodlineRolls} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );

    // Step 15: Clear concept rolls older than 1 day
    await drizzleDB.execute(
      sql`DELETE FROM ${conceptImage} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );

    // Step 15: Clear forums older than 1 day
    await drizzleDB.execute(
      sql`DELETE FROM ${forumThread} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );
    await drizzleDB.execute(
      sql`DELETE FROM ${forumPost} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );
    await drizzleDB.execute(
      sql`DELETE FROM ${forumPost} a WHERE NOT EXISTS (SELECT id FROM ${forumThread} b WHERE b.id = a.threadId)`,
    );

    // Step 16: Historical avatars
    await drizzleDB.execute(
      sql`DELETE FROM ${historicalAvatar} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );

    // Step 17: Historical avatars
    await drizzleDB.execute(
      sql`DELETE FROM ${questHistory} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );

    // Step 18: User attributes
    await drizzleDB.execute(
      sql`DELETE FROM ${userAttribute} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );

    // Step 18: User jutsu & items
    await drizzleDB.execute(
      sql`DELETE FROM ${userJutsu} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );
    await drizzleDB.execute(
      sql`DELETE FROM ${userItem} a WHERE NOT EXISTS (SELECT userId FROM ${userData} b WHERE b.userId = a.userId)`,
    );

    // Update timer
    await updateGameSetting(`timer-${frequency}h`, 0, new Date());

    return Response.json(`OK`);
  } catch (cause) {
    console.error(cause);
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return Response.json(cause, { status: httpCode });
    }
    // Another error occured
    return Response.json("Internal server error", { status: 500 });
  }
}
