import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";

import { UserProfile } from "@clerk/nextjs";

const Login: NextPage = () => {
  return (
    <ContentBox title="Account" subtitle="Manage accounts linked to your profile">
      <UserProfile path="/account" routing="path" />
    </ContentBox>
  );
};

export default Login;
