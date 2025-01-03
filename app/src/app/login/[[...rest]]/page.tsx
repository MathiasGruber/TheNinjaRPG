"use client";

import ContentBox from "@/layout/ContentBox";
import { SignIn } from "@clerk/nextjs";

export default function LoginUser() {
  return (
    <ContentBox
      title="Login"
      subtitle="To login please use one of below providers"
      alreadyHasH1
    >
      <SignIn
        path="/login"
        routing="path"
        signUpUrl="/signup"
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full",
          },
        }}
      />
    </ContentBox>
  );
}
