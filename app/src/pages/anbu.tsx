import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import { useRequiredUserData } from "../utils/UserContext";

const ANBU: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  if (!userData) return <Loader explanation="Loading userdata" />;
  return (
    <ContentBox
      title="ANBU"
      subtitle="Form squads with fellow villages"
      back_href="/village"
    >
      WIP
    </ContentBox>
  );
};

export default ANBU;
