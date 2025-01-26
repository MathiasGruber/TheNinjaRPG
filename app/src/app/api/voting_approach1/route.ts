import { eq, and } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userVote } from "@/drizzle/schema";
import { handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  await cookies();

  // https://topwebgames.com/game/theninja-rpg-core4/vote?incentive=testSecret-topwebgames&test=true&alwaysReward=true

  try {
    const data = await request.formData();
    const incentive = data.get("incentive") as string;
    const [secret, siteId] = incentive?.split("-") ?? [];

    if (!secret || !siteId) {
      return Response.json(`Invalid incentive: ${incentive}`, { status: 400 });
    }

    await handleVote(secret, siteId);
    return Response.json(`OK: ${secret} ${siteId}`);
  } catch (cause) {
    return handleEndpointError(cause);
  }
}

export async function GET(request: Request) {
  await cookies();

  // https://www.top100arena.com/listing/101116/vote?incentive=testSecret-top100arena
  // https://mmohub.com/site/1054/vote/testSecret-mmohub
  // https://www.arena-top100.com/index.php?a=in&u=Terriator&incentive=testSecret-arenaTop100

  try {
    const { searchParams } = new URL(request.url);
    const incentive = (searchParams.get("incentive") ||
      searchParams.get("param") ||
      searchParams.get("userid"))!;
    const [secret, siteId] = incentive?.split("-") ?? [];

    if (!secret || !siteId) {
      return Response.json(`Invalid incentive: ${incentive}`, { status: 400 });
    }

    await handleVote(secret, siteId);
    return Response.json(`OK: ${secret} ${siteId}`);
  } catch (cause) {
    return handleEndpointError(cause);
  }
}

async function handleVote(secret: string, siteId: string) {
  const now = new Date();

  // First try to find existing vote record
  const existingVote = await drizzleDB.query.userVote.findFirst({
    where: and(eq(userVote.secret, secret)),
  });

  if (existingVote) {
    // Update existing record
    await drizzleDB
      .update(userVote)
      .set({
        ...(siteId === "topwebgames" ? { topWebGames: true } : {}),
        ...(siteId === "top100arena" ? { top100Arena: true } : {}),
        ...(siteId === "mmohub" ? { mmoHub: true } : {}),
        ...(siteId === "arenaTop100" ? { arenaTop100: true } : {}),
        ...(siteId === "xtremeTop100" ? { xtremeTop100: true } : {}),
        ...(siteId === "topOnlineMmorpg" ? { topOnlineMmorpg: true } : {}),
        ...(siteId === "gamesTop200" ? { gamesTop200: true } : {}),
        ...(siteId === "browserMmorpg" ? { browserMmorpg: true } : {}),
        ...(siteId === "apexWebGaming" ? { apexWebGaming: true } : {}),
        ...(siteId === "mmorpg100" ? { mmorpg100: true } : {}),
        lastVoteAt: now,
      })
      .where(eq(userVote.secret, secret));
  }
}
