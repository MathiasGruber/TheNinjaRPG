import { createContext, useEffect } from "react";
import { useContext } from "react";
import { useSession } from "next-auth/react";
import { Prisma } from "@prisma/client";
import { useRouter } from "next/router";

// Create type for user with relations (usually would be done in route,
// but exception is made for userdata as we use it in the context provider)
const userdataWithRelations = Prisma.validator<Prisma.UserDataArgs>()({
  include: { village: true, bloodline: true },
});
export type UserDataWithRelations = Prisma.UserDataGetPayload<
  typeof userdataWithRelations
>;

// User context
export const UserContext = createContext<{
  data: UserDataWithRelations | null | undefined;
  status: string;
  refetch: (options?: any) => Promise<any> | void;
}>({ data: undefined, status: "unknown", refetch: () => undefined });

// Easy hook for getting the current user data
export const useUser = () => {
  return useContext(UserContext);
};

// Require the user to be logged in
export const useRequiredUser = () => {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { data, status, refetch } = useUser();
  useEffect(() => {
    if (data === null || sessionStatus === "unauthenticated") {
      void router.push("/");
    }
  }, [router, data, sessionStatus]);
  return { data, status, refetch };
};
