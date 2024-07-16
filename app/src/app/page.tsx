import IndexPage from "@/app/index";
import { getInfiniteThreads } from "@/routers/forum";
import { drizzleDB } from "@/server/db";

export default async function Index() {
  // Initial data from server for speed
  const initialNews = await getInfiniteThreads({
    client: drizzleDB,
    boardName: "News",
    limit: 10,
  });
  // If we're here, we're still fetching user data
  return <IndexPage initialNews={initialNews} />;
}
