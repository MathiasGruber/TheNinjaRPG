import { createContext, useEffect } from "react";
import { useContext } from "react";
import { useSafePush } from "../utils/routing";
import { useAuth } from "@clerk/nextjs";
import type Pusher from "pusher-js";
import type { UserWithRelations } from "../server/api/routers/profile";
import type { ReturnedBattle } from "../libs/combat/types";

// Events sent to the user from websockets
export type UserEvent = {
  type: "battle";
};

// User (& current battle) context
export const UserContext = createContext<{
  data: UserWithRelations;
  battle: ReturnedBattle | undefined;
  status: string;
  pusher: Pusher | undefined;
  timeDiff: number;
  setBattle: React.Dispatch<React.SetStateAction<ReturnedBattle | undefined>>;
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
  const router = useSafePush();
  const { isLoaded, isSignedIn } = useAuth();
  const info = useUserData();
  const { data, status } = info;
  useEffect(() => {
    if (isLoaded && status !== "loading" && (data === undefined || !isSignedIn)) {
      void router.push("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data, isLoaded, isSignedIn]);
  return info;
};
