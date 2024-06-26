import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { showMutationToast } from "@/libs/toast";
import type { UserWithRelations } from "../server/api/routers/profile";

/**
 * A hook to perform safe router pushes in case of multiple clicks. Taken from:
 * https://stackoverflow.com/a/75872313
 */
export const useSafePush = () => {
  // State
  const [onChanging, setOnChanging] = useState(false);
  // When route changes, set onChanging to false
  const handleRouteChange = () => setOnChanging(false);
  // Get router
  const router = useRouter();
  // Method for safely pushing to be returned by hook
  const push = async (path: string) => {
    if (onChanging) {
      console.log(`Cancelling route '${path}' due to previous route being handled`);
      return;
    }
    setOnChanging(true);
    await router.push(path);
  };
  // Listen for route changes
  useEffect(() => {
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, setOnChanging]);
  // Return safe push method
  return { push, query: router.query };
};

export const useAwake = (userData: UserWithRelations) => {
  const router = useSafePush();
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
