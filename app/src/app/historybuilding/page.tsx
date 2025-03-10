import FancyForumThreads from "@/layout/FancyForumThreads";
import { currentUser } from "@clerk/nextjs/server";
import { canCreateNews } from "@/utils/permissions";
import { getInfiniteThreads } from "@/routers/forum";
import { fetchUser } from "@/routers/profile";
import { drizzleDB } from "@/server/db";
import { IMG_BUILDING_ARCHIVE } from "@/drizzle/constants";

export default async function HistoryBuilding() {
  // Session information
  const user = await currentUser();
  // Initial data from server for speed
  const [initialNews, userData] = await Promise.all([
    getInfiniteThreads({
      client: drizzleDB,
      boardName: "History",
      limit: 10,
    }),
    ...(user ? [fetchUser(drizzleDB, user.id)] : []),
  ]);

  // Can post news?
  const canPost = userData && canCreateNews(userData.role);

  // Show board
  return (
    <FancyForumThreads
      board_name="History"
      canPost={canPost}
      back_href="/village"
      image={IMG_BUILDING_ARCHIVE}
      initialData={initialNews}
    />
  );
}
