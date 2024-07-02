import { type NextPage } from "next";
import FancyForumThreads from "@/layout/FancyForumThreads";
import { useUserData } from "@/utils/UserContext";
import { canCreateNews } from "../validators/forum";

const HistoryBuilding: NextPage = () => {
  // User
  const { data: userData } = useUserData();

  // Can post news?
  const canPost = userData && canCreateNews(userData);

  // Show board
  return (
    <FancyForumThreads board_name="History" canPost={canPost} image="/archive.webp" />
  );
};

export default HistoryBuilding;
