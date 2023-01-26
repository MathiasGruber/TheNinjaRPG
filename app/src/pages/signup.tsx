import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";

import { SignUp } from "@clerk/nextjs";

const Login: NextPage = () => {
  return (
    <ContentBox title="Login" subtitle="To login please use one of below providers">
      <SignUp
        path="/signup"
        routing="path"
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "w-full",
          },
        }}
      />
    </ContentBox>
  );
};

export default Login;
