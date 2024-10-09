import FancyForumThreads from "@/layout/FancyForumThreads";
import { currentUser } from "@clerk/nextjs/server";
import { getInfiniteThreads, readNews } from "@/routers/forum";
import { canCreateNews } from "@/validators/forum";
import { fetchUser } from "@/routers/profile";
import { drizzleDB } from "@/server/db";
import { IMG_BUILDING_NEWS } from "@/drizzle/constants";

export default async function News() {
  // Session information
  const user = await currentUser();
  // Initial data from server for speed
  const [initialNews, userData] = await Promise.all([
    getInfiniteThreads({
      client: drizzleDB,
      boardName: "News",
      limit: 10,
    }),
    ...(user ? [fetchUser(drizzleDB, user.id)] : []),
  ]);

  // Can post news?
  const canPost = userData && canCreateNews(userData);

  // Switch off news notifications
  if (userData && userData.unreadNews > 0) {
    await readNews(drizzleDB, userData.userId);
  }

  // Show board
  return (
    <FancyForumThreads
      board_name="News"
      canPost={canPost}
      image={IMG_BUILDING_NEWS}
      initialData={initialNews}
    />
  );
}
