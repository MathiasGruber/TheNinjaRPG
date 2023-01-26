import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import { useRequiredUserData } from "../utils/UserContext";

const Alliance: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  if (!userData) return <Loader explanation="Loading userdata" />;
  return (
    <ContentBox
      title="Alliance"
      subtitle="Alliance status between villages"
      back_href="/village"
    >
      WIP
    </ContentBox>
  );
};

export default Alliance;
