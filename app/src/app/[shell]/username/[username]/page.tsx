import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { userData } from "@/drizzle/schema";
import PublicUserComponent from "@/layout/PublicUser";
import { showUserRank } from "@/libs/profile";
import { isProfileIndexable } from "@/libs/profileIndexing";
import { absoluteUrl, buildMetadata, noindexMetadata } from "@/libs/seo";
import { drizzleDB } from "@/server/db";
import { displayTitleSql } from "@/server/utils/titleDisplay";

// Cached so generateMetadata and the page render share a single lookup rather than
// each issuing their own query for the same profile.
const fetchProfile = cache(async (username: string) => {
  return await drizzleDB.query.userData.findFirst({
    extras: (table) => ({ displayTitle: displayTitleSql(table).as("displayTitle") }),
    columns: {
      userId: true,
      username: true,
      level: true,
      rank: true,
      isOutlaw: true,
      avatar: true,

      updatedAt: true,
      isAi: true,
      isBanned: true,
      deletionAt: true,
    },
    with: { village: { columns: { name: true } } },
    where: eq(userData.username, decodeURIComponent(username)),
  });
});

/** Build canonical, indexability-aware metadata from the profile lookup shared with the page. */
export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const user = await fetchProfile(params.username);
  // Unresolvable profiles must stay out of the search index.
  if (!user) return noindexMetadata("Player Not Found");
  const rank = showUserRank(user);
  const village = user.village?.name;
  // A profile the sitemap would not advertise should not stay in the index on the
  // strength of an old crawl either; the page still renders for anyone who visits.
  if (!isProfileIndexable(user)) {
    return noindexMetadata(`${user.username} - Level ${user.level} ${rank}`);
  }
  return buildMetadata({
    title: `${user.username} - Level ${user.level} ${rank}`,
    description: `${user.username} is a level ${user.level} ${rank}${
      village ? ` of ${village}` : ""
    } in TheNinja-RPG. View their stats, bloodline, badges and battle history.`,
    path: `/username/${encodeURIComponent(user.username)}`,
    image: user.avatar ? absoluteUrl(user.avatar) : undefined,
    type: "article",
  });
}

/** Render the shared public profile by username with its resolved player or NPC title. */
export default async function PublicProfile(props: {
  params: Promise<{ username: string }>;
}) {
  const params = await props.params;
  const user = await fetchProfile(params.username);
  // Return a real 404 for unresolvable profiles to avoid indexing a soft-404 page.
  if (!user) notFound();
  return (
    <PublicUserComponent
      userId={user.userId}
      title="Users"
      // Same lookup that built the metadata above, handed to the client component so the
      // server render carries this player's name, rank and village instead of a
      // placeholder identical to every other profile's.
      initialProfile={{
        username: user.username,
        level: user.level,
        rank: user.rank,
        isOutlaw: user.isOutlaw,
        avatar: user.avatar,
        displayTitle: user.displayTitle,
        villageName: user.village?.name,
      }}
      defaultBackHref="/users"
      showRecruited
      showStudents
      showBadges
      showNindo
      showReports
      showTransactions
      showActionLogs
      showTrainingLogs
      showCombatLogs
      showMarriages
      showHistoricalIps
      showActivityEvents
      showBloodlineHistory
    />
  );
}
