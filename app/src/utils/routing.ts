import { useEffect, useState } from "react";
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
  const safePush = (path: string) => {
    if (onChanging) {
      console.log(`Cancelling route '${path}' due to previous route being handled`);
      return;
    }
    setOnChanging(true);
    void router.push(path);
  };
  // Listen for route changes
  useEffect(() => {
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, setOnChanging]);
  // Return safe push method
  return { safePush };
};
