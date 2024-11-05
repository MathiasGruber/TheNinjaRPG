/**
 * This is the client-side entrypoint for your tRPC API.
 */

import { TRPCClientError } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { toast } from "@/components/ui/use-toast";
import { type AppRouter } from "@/api/root";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";

/** A set of type-safe react-query hooks for your tRPC API. */
export const api = createTRPCReact<AppRouter>({
  // Abort on onmount, see: https://trpc.io/docs/client/react/aborting-procedure-calls
  abortOnUnmount: false,
});

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const onError = (err: unknown) => {
  if (err instanceof TRPCClientError) {
    toast({
      variant: "destructive",
      title: err?.data?.code ?? "Unknown", // eslint-disable-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      description: err.message,
    });
  } else if (err instanceof Error) {
    toast({
      variant: "destructive",
      title: "Error",
      description: err.message,
    });
  }
};
