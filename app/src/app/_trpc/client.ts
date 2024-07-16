/**
 * This is the client-side entrypoint for your tRPC API.
 */

import { createTRPCReact } from "@trpc/react-query";
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
