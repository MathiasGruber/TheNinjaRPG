import FancyForumThreads from "@/layout/FancyForumThreads";
import { currentUser } from "@clerk/nextjs/server";
import { canCreateNews } from "@/utils/permissions";
import { getInfiniteThreads } from "@/routers/forum";
import { fetchUpdatedUser } from "@/routers/profile";
import { drizzleDB } from "@/server/db";
import { IMG_BUILDING_GLOBALANBU } from "@/drizzle/constants";
import StoryQuests from "./StoryQuests";

export default async function GlobalAnbuHQ() {
  // Session information
  const user = await currentUser();
  // Initial data from server for speed
  const [initialNews, updatedUser] = await Promise.all([
    getInfiniteThreads({
      client: drizzleDB,
      boardName: "ANBU HQ",
      limit: 10,
    }),
    ...(user ? [fetchUpdatedUser({ client: drizzleDB, userId: user.id })] : []),
  ]);
  const userData = updatedUser?.user;

  // Can post news?
  const canPost = userData && canCreateNews(userData.role);

  // Show board
  return (
    <>
      <FancyForumThreads
        board_name="ANBU HQ"
        canPost={canPost}
        back_href="/village"
        image={IMG_BUILDING_GLOBALANBU}
        initialData={initialNews}
      />
      {userData && <StoryQuests userData={userData} />}
    </>
  );
}
