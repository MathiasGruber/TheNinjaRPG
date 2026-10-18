import { Suspense } from "react";
import NativeBrowserSignIn from "@/components/native/NativeBrowserSignIn";

export default function NativeSignInPage() {
  return (
    <Suspense>
      <NativeBrowserSignIn />
    </Suspense>
  );
}
