import FancyForumThreads from "@/layout/FancyForumThreads";
import { currentUser } from "@clerk/nextjs/server";
import { canCreateNews } from "@/validators/forum";
import { getInfiniteThreads } from "@/routers/forum";
import { fetchUser } from "@/routers/profile";
import { drizzleDB } from "@/server/db";

export default async function GlobalAnbuHQ() {
  // Session information
  const user = await currentUser();
  // Initial data from server for speed
  const [initialNews, userData] = await Promise.all([
    getInfiniteThreads({
      client: drizzleDB,
      boardName: "ANBU HQ",
      limit: 10,
    }),
    ...(user ? [fetchUser(drizzleDB, user.id)] : []),
  ]);

  // Can post news?
  const canPost = userData && canCreateNews(userData);

  // Show board
  return (
    <FancyForumThreads
      board_name="ANBU HQ"
      canPost={canPost}
      image="/globalanbuhq.webp"
      initialData={initialNews}
    />
  );
}
