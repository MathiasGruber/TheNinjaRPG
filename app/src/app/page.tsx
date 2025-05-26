"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useUserData } from "@/utils/UserContext";
import { useRouter } from "next/navigation";
import Loader from "@/layout/Loader";
import Welcome from "@/layout/Welcome";

export default function Index() {
  // Fetch data
  const { isSignedIn } = useUser();
  const { data: userData, status: userStatus, userId } = useUserData();

  // Navigation
  const router = useRouter();

  // Redirect based on user status
  useEffect(() => {
    if (userStatus !== "pending" && !userData) {
      if (userStatus === "error") {
        void router.push("/500");
      } else {
        void router.push("/register");
      }
    }
    if (userData && userId) {
      void router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData, userId, userStatus]);

  // Guard
  if (!isSignedIn && !userData) {
    return <Welcome />;
  } else {
    return <Loader explanation="Forwarding to profile" />;
  }
}
