import { useEffect } from "react";
import { useSafePush } from "./routing";
import { useRequiredUserData } from "./UserContext";
import { calcIsInVillage } from "../libs/travel/controls";

/**
 * A hook which requires the user to be in their village,
 * otherwise redirect to the profile page
 */
export const useRequireInVillage = () => {
  const { data: userData } = useRequiredUserData();
  const router = useSafePush();
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
