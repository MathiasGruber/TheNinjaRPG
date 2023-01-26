import { useRouter } from "next/router";
import type { UserWithRelations } from "../server/api/routers/profile";

export const useAwake = (userData: UserWithRelations) => {
  const router = useRouter();
  if (userData?.status === "AWAKE") {
    return true;
  } else if (userData?.status === "HOSPITALIZED") {
    void router.push("/hospital");
  } else if (userData?.status === "BATTLE") {
    void router.push("/combat");
  } else if (userData?.status === "TRAVEL") {
    void router.push("/travel");
  }
  return false;
};
