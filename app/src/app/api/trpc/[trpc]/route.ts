import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies, headers } from "next/headers";
import { createAppTRPCContext } from "@/api/trpc";
import type { NextRequest } from "next/server";
import { appRouter } from "@/api/root";

export const runtime = "nodejs";

const handler = (req: NextRequest) => {
  const readCookies = cookies();
  const readHeaders = headers();

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext() {
      return createAppTRPCContext({ req, readHeaders, readCookies });
    },
    onError: ({ error, path }) => {
      if (!["UNAUTHORIZED", "TOO_MANY_REQUESTS"].includes(error.code)) {
        console.error(
          `❌ tRPC failed with ${error.code} on ${path ?? "<no-path>"}: ${error.message}. Stack: ${
            error.stack
          }`,
        );
      }
    },
  });
};

export { handler as GET, handler as POST };
