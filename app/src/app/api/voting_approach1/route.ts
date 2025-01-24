import { eq, and, sql } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userVote } from "@/drizzle/schema";
import { nanoid } from "nanoid";
import { handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  await cookies();

  try {
    const data = await request.formData();
    const incentive = data.get("incentive") as string;
    const [userId, secret, siteId] = incentive.split("-");

    if (!userId || !secret || !siteId) {
      return Response.json(`Invalid incentive: ${incentive}`, { status: 400 });
    }

    await handleVote(userId, secret, siteId);
    return Response.json(`OK`);
  } catch (cause) {
    return handleEndpointError(cause);
  }
}

export async function GET(request: Request) {
  await cookies();

  try {
    const { searchParams } = new URL(request.url);
    const incentive = searchParams.get("incentive") as string;
    const [userId, secret, siteId] = incentive.split("-");

    if (!userId || !secret || !siteId) {
      return Response.json(`Invalid incentive: ${incentive}`, { status: 400 });
    }

    await handleVote(userId, secret, siteId);
    return Response.json(`OK`);
  } catch (cause) {
    return handleEndpointError(cause);
  }
}

async function handleVote(userId: string, secret: string, siteId: string) {
  const now = new Date();

  // First try to find existing vote record
  const existingVote = await drizzleDB.query.userVote.findFirst({
    where: and(eq(userVote.userId, userId)),
  });

  if (existingVote) {
    // Update existing record
    await drizzleDB
      .update(userVote)
      .set({
        ...(siteId === "topwebgames" ? { topWebGames: true } : {}),
        lastVoteAt: now,
      })
      .where(and(eq(userVote.userId, userId), eq(userVote.secret, secret)));
  } else {
    // Insert new record
    await drizzleDB.insert(userVote).values({
      id: nanoid(),
      userId,
      secret,
      ...(siteId === "topwebgames" ? { topWebGames: true } : {}),
      lastVoteAt: now,
    });
  }
}
