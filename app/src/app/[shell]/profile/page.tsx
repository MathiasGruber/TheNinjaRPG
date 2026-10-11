import { Suspense } from "react";
import Loader from "@/layout/Loader";
import { Profile } from "@/layout/Profile";

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loader explanation="Loading profile page..." />}>
      <Profile />
    </Suspense>
  );
}
