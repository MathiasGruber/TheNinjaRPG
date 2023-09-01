import { type NextPage } from "next";
import ContentBox from "../../layout/ContentBox";

import { SignIn } from "@clerk/nextjs";

const Login: NextPage = () => {
  return (
    <ContentBox title="Login" subtitle="To login please use one of below providers">
      <SignIn
        path="/login"
        routing="path"
        redirectUrl="/"
        signUpUrl="/signup"
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
