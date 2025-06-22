import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies, headers } from "next/headers";
import { createAppTRPCContext } from "@/api/trpc";
import type { NextRequest } from "next/server";
import { appRouter } from "@/api/root";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const maxDuration = 90;

const handler = async (req: NextRequest) => {
  const readCookies = await cookies();
  const readHeaders = await headers();

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext() {
      return createAppTRPCContext({ req, readHeaders, readCookies });
    },
    onError: ({ error, path, input }) => {
      if (!["UNAUTHORIZED", "TOO_MANY_REQUESTS"].includes(error.code)) {
        console.error(
          `❌ tRPC failed with ${error.code} on ${path ?? "<no-path>"}. Message: ${error.message}. Input: ${JSON.stringify(input)}. Stack: ${error.stack}`,
        );
        Sentry.captureException(error);
      }
    },
  });
};

export { handler as GET, handler as POST };
