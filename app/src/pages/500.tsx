import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";

const PrivacyPolicy: NextPage = () => {
  return (
    <ContentBox title="500: Server error">
      <p>You have encountered a server error 😭 </p>
      <p>Our log system should have picked it up, and we will investigate asap.</p>
    </ContentBox>
  );
};

export default PrivacyPolicy;
