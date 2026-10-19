import { Suspense } from "react";
import NativeBrowserSignIn from "@/components/native/NativeBrowserSignIn";
import { noindexMetadata } from "@/libs/seo";

export const metadata = noindexMetadata("Sign in to the app");

export default function NativeSignInPage() {
  return (
    <Suspense>
      <NativeBrowserSignIn />
    </Suspense>
  );
}
