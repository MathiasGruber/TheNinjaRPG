import { useEffect } from "react";
import { useRouter } from "next/router";
import { show_toast } from "../libs/toast";
import type { UserWithRelations } from "../server/api/routers/profile";

export const useAwake = (userData: UserWithRelations) => {
  const router = useRouter();
  const userStatus = userData?.status;
  useEffect(() => {
    if (userStatus === "HOSPITALIZED") {
      show_toast("User Status", "Redirecting to hospital", "info");
      void router.push("/hospital");
    } else if (userStatus === "BATTLE") {
      show_toast("User Status", "Redirecting to combat", "info");
      void router.push("/combat");
    } else if (userStatus === "TRAVEL") {
      show_toast("User Status", "Redirecting to travel", "info");
      void router.push("/travel");
    } else if (userStatus === "ASLEEP") {
      show_toast("User Status", "Redirecting to home", "info");
      void router.push("/home");
    }
  }, [userStatus, router]);
  return userStatus === "AWAKE" ? true : false;
};
