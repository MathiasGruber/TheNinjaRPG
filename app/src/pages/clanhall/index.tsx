import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { useRequiredUserData } from "@/utils/UserContext";

const Clans: NextPage = () => {
  const { data: userData } = useRequiredUserData();

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (userData.isOutlaw) return <Loader explanation="Unlikely to find outlaw clans" />;

  // Render
  return (
    <ContentBox
      title="Clans"
      subtitle="Join a clan and fight together"
      back_href="/village"
    >
      WIP
    </ContentBox>
  );
};

export default Clans;
