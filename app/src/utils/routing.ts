import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { showMutationToast } from "@/libs/toast";
import type { UserWithRelations } from "../server/api/routers/profile";

export const useAwake = (userData: UserWithRelations) => {
  const router = useRouter();
  const userStatus = userData?.status;
  useEffect(() => {
    if (userStatus === "HOSPITALIZED") {
      showMutationToast({ success: false, message: "Redirecting to hospital" });
      void router.push("/hospital");
    } else if (userStatus === "BATTLE") {
      showMutationToast({ success: false, message: "Redirecting to combat" });
      void router.push("/combat");
    } else if (userStatus === "TRAVEL") {
      showMutationToast({ success: false, message: "Redirecting to travel" });
      void router.push("/travel");
    } else if (userStatus === "ASLEEP") {
      showMutationToast({ success: false, message: "Redirecting to sleep" });
      void router.push("/home");
    }
  }, [userStatus, router]);
  return userStatus === "AWAKE" ? true : false;
};
