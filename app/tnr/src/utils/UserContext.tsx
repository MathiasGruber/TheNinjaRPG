import { createContext, useEffect } from "react";
import { useContext } from "react";
import { Prisma } from "@prisma/client";
import { useRouter } from "next/router";
import { useAuth } from "@clerk/nextjs";

// Create type for user with relations (usually would be done in route,
// but exception is made for userdata as we use it in the context provider)
const userdataWithRelations = Prisma.validator<Prisma.UserDataArgs>()({
  include: { village: true, bloodline: true },
});
export type UserDataWithRelations =
  | Prisma.UserDataGetPayload<typeof userdataWithRelations>
  | null
  | undefined;

// User context
export const UserContext = createContext<{
  data: UserDataWithRelations;
  status: string;
  refetch: (options?: any) => Promise<any> | void;
}>({ data: undefined, status: "unknown", refetch: () => undefined });

// Easy hook for getting the current user data
export const useUserData = () => {
  return useContext(UserContext);
};

// Require the user to be logged in
export const useRequiredUserData = () => {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { data, status, refetch } = useUserData();
  useEffect(() => {
    if (data === null || (!isSignedIn && isLoaded)) {
      void router.push("/");
    }
  }, [router, data, isLoaded, isSignedIn]);
  return { data, status, refetch };
};
