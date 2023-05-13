import { createContext, useEffect } from "react";
import { useContext } from "react";
import { Prisma, type BattleType } from "@prisma/client";
import { useRouter } from "next/router";
import { useAuth } from "@clerk/nextjs";
import type { UserEffect, GroundEffect } from "../libs/combat/types";

import { type ReturnedUserState } from "../libs/combat/types";

// Create type for user with relations (usually would be done in route,
// but exception is made for userdata as we use it in the context provider)
const userdataWithRelations = Prisma.validator<Prisma.UserDataArgs>()({
  include: { village: true, bloodline: true },
});
export type UserDataWithRelations =
  | Prisma.UserDataGetPayload<typeof userdataWithRelations>
  | null
  | undefined;

// Create type for battle, which contains information on user current state
export type UserBattle = {
  usersState: ReturnedUserState[];
  usersEffects: UserEffect[];
  groundEffects: GroundEffect[];
  id: string;
  createdAt: Date;
  updatedAt: Date;
  background: string;
  battleType: BattleType;
  version: number;
};

// Events sent to the user from websockets
export type UserEvent = {
  type: "battle";
};

// User (& current battle) context
export const UserContext = createContext<{
  data: UserDataWithRelations;
  battle: UserBattle | undefined;
  status: string;
  setBattle: React.Dispatch<React.SetStateAction<UserBattle | undefined>>;
  refetch: (options?: any) => Promise<any> | void;
}>({
  data: undefined,
  battle: undefined,
  status: "unknown",
  setBattle: () => undefined,
  refetch: () => undefined,
});

// Easy hook for getting the current user data
export const useUserData = () => {
  return useContext(UserContext);
};

// Require the user to be logged in
export const useRequiredUserData = () => {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { data, status, refetch, battle, setBattle } = useUserData();
  useEffect(() => {
    if (data === null || (!isSignedIn && isLoaded)) {
      void router.push("/");
    }
  }, [router, data, isLoaded, isSignedIn]);
  return { data, status, refetch, battle, setBattle };
};
