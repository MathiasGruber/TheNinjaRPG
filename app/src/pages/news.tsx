import { type NextPage } from "next";
import { useEffect } from "react";
import FancyForumThreads from "@/layout/FancyForumThreads";
import { api } from "@/utils/api";
import { useUserData } from "@/utils/UserContext";
import { canCreateNews } from "../validators/forum";

const News: NextPage = () => {
  // User
  const { data: userData, refetch } = useUserData();

  // Can post news?
  const canPost = userData && canCreateNews(userData);

  // Switch off news notifications
  const { mutate } = api.forum.readNews.useMutation({
    onSuccess: async () => {
      await refetch();
    },
  });
  useEffect(() => {
    if (userData && userData.unreadNews > 0) {
      mutate();
    }
  }, [userData, mutate]);

  // Show board
  return <FancyForumThreads board_name="News" canPost={canPost} image="/news.webp" />;
};

export default News;
