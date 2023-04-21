import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";

const Home: NextPage = () => {
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
