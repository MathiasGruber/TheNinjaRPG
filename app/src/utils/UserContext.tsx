import { createContext, useEffect } from "react";
import { useContext } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@clerk/nextjs";
import type Pusher from "pusher-js";
import type { UserWithRelations } from "../server/api/routers/profile";
import type { UserEffect, GroundEffect } from "../libs/combat/types";
import type { BattleType } from "../../drizzle/schema";
import type { ReturnedUserState } from "../libs/combat/types";

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
  data: UserWithRelations;
  battle: UserBattle | undefined;
  status: string;
  pusher: Pusher | undefined;
  timeDiff: number;
  setBattle: React.Dispatch<React.SetStateAction<UserBattle | undefined>>;
  refetch: (options?: any) => Promise<any> | void;
}>({
  data: undefined,
  battle: undefined,
  status: "unknown",
  pusher: undefined,
  timeDiff: 0,
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
  const info = useUserData();
  const { data, status } = info;
  useEffect(() => {
    if (isLoaded && status !== "loading" && (data === undefined || !isSignedIn)) {
      void router.push("/");
    }
  }, [router, status, data, isLoaded, isSignedIn]);
  return info;
};
