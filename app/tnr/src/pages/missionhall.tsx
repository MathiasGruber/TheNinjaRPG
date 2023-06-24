import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import { useRequiredUserData } from "../utils/UserContext";

const Missions: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  if (!userData) return <Loader explanation="Loading userdata" />;
  return (
    <ContentBox
      title="Missions"
      subtitle="Complete missions for great rewards"
      back_href="/village"
    >
      WIP
    </ContentBox>
  );
};

export default Missions;
