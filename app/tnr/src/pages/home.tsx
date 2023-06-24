import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import { useRequiredUserData } from "../utils/UserContext";

const Home: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  if (!userData) return <Loader explanation="Loading userdata" />;
  return (
    <ContentBox
      title="Your Home"
      subtitle="Store items, host parties, etc."
      back_href="/village"
    >
      WIP
    </ContentBox>
  );
};

export default Home;
