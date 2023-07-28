import { useEffect } from "react";
import { useRouter } from "next/router";
import { show_toast } from "../libs/toast";
import type { UserWithRelations } from "../server/api/routers/profile";

export const useAwake = (userData: UserWithRelations) => {
  const router = useRouter();
  const userStatus = userData?.status;
  useEffect(() => {
    if (userStatus) {
      show_toast("User Status", "Must be awake to see this page", "info");
    }
    if (userStatus === "HOSPITALIZED") {
      void router.push("/hospital");
    } else if (userStatus === "BATTLE") {
      void router.push("/combat");
    } else if (userStatus === "TRAVEL") {
      void router.push("/travel");
    } else if (userStatus === "ASLEEP") {
      void router.push("/home");
    }
  }, [userStatus, router]);
  return userStatus === "AWAKE" ? true : false;
};
