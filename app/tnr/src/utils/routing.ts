import { useRouter } from "next/router";
import { UserStatus } from "@prisma/client/edge";
import { type UserDataWithRelations } from "./UserContext";

export const useAwake = (userData: UserDataWithRelations) => {
  const router = useRouter();
  if (userData?.status === UserStatus.AWAKE) {
    return true;
  } else if (userData?.status === UserStatus.HOSPITALIZED) {
    void router.push("/hospital");
  } else if (userData?.status === UserStatus.BATTLE) {
    void router.push("/combat");
  } else if (userData?.status === UserStatus.TRAVEL) {
    void router.push("/travel");
  }
  return false;
};
