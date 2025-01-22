import { eq, and, sql } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userVotes } from "@/drizzle/schema";
import { nanoid } from "nanoid";
import { handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  // disable cache for this server action
  await cookies();

  try {
    const now = new Date();
    const data = (await request.formData()) as { uid?: string };
    const uid = data.uid;

    await drizzleDB.insert(userVotes).values({
      id: nanoid(),
      userId: uid,
      siteId: "topwebgames.com",
      lastVoteAt: now,
    });

    // Validate data
    const userId = uid || "unknown_user";
    const siteId = "topwebgames.com";

    // First try to find existing vote record
    const existingVote = await drizzleDB.query.userVotes.findFirst({
      where: and(eq(userVotes.userId, userId), eq(userVotes.siteId, siteId)),
    });

    if (existingVote) {
      // Update existing record
      await drizzleDB
        .update(userVotes)
        .set({
          votes: sql`${userVotes.votes} + 1`,
          lastVoteAt: now,
        })
        .where(and(eq(userVotes.userId, userId), eq(userVotes.siteId, siteId)));
    } else {
      // Insert new record
      await drizzleDB.insert(userVotes).values({
        id: nanoid(),
        userId,
        siteId,
        lastVoteAt: now,
      });
    }

    return Response.json(`OK`);
  } catch (cause) {
    return handleEndpointError(cause);
  }
}
