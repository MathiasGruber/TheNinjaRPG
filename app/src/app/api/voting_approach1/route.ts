import { eq, and, sql } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userVote } from "@/drizzle/schema";
import { nanoid } from "nanoid";
import { handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  // disable cache for this server action
  await cookies();

  try {
    const now = new Date();
    const data = await request.formData();
    const userId = (data.get("userid") as string) || "unknown_user";
    const secret = (data.get("secret") as string) || "unknown_secret";
    const siteId = (data.get("site") as string) || "unknown_site";

    // First try to find existing vote record
    const existingVote = await drizzleDB.query.userVote.findFirst({
      where: and(eq(userVote.userId, userId)),
    });

    if (existingVote) {
      // Update existing record
      await drizzleDB
        .update(userVote)
        .set({
          ...(siteId === "topwebgames.com" ? { topWebGames: true } : {}),
          lastVoteAt: now,
        })
        .where(and(eq(userVote.userId, userId), eq(userVote.secret, secret)));
    } else {
      // Insert new record
      await drizzleDB.insert(userVote).values({
        id: nanoid(),
        userId,
        secret,
        ...(siteId === "topwebgames.com" ? { topWebGames: true } : {}),
        lastVoteAt: now,
      });
    }

    return Response.json(`OK`);
  } catch (cause) {
    return handleEndpointError(cause);
  }
}
