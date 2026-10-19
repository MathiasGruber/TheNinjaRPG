import { api } from "@/app/_trpc/client";

/** Keep the app's cookie-authenticated tRPC transport for the handoff as well. */
export const useNativeAuthHandoff = () => ({
  start: api.nativeAuth.start.useMutation().mutateAsync,
  exchange: api.nativeAuth.exchange.useMutation().mutateAsync,
});
