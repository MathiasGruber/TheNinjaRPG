import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";

const PrivacyPolicy: NextPage = () => {
  return (
    <ContentBox title="404: Page Not Found">
      <p>The page you are trying to access could not be found 😅 </p>
      <p>Please check the URL and try again.</p>
    </ContentBox>
  );
};

export default PrivacyPolicy;
