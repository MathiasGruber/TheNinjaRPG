import { useEffect } from "react";
import { useRouter } from "next/router";
import { useRequiredUserData } from "./UserContext";
import { calcIsInVillage } from "../libs/travel/controls";

/**
 * A hook which requires the user to be in their village,
 * otherwise redirect to the profile page
 */
export const useRequireInVillage = () => {
  const { data: userData } = useRequiredUserData();
  const router = useRouter();
  useEffect(() => {
    if (
      userData &&
      !calcIsInVillage({
        x: userData.longitude,
        y: userData.latitude,
      })
    ) {
      void router.push("/");
    }
  }, [userData, router]);
};
