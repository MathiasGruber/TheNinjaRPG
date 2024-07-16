import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies, headers } from "next/headers";
import { createAppTRPCContext } from "@/api/trpc";
import type { NextRequest } from "next/server";
import { Handlers, H } from "@highlight-run/node";
import { appRouter } from "@/api/root";

export const runtime = "nodejs";

// Highlight.io init
H.init({
  projectID: process.env.NEXT_PUBLIC_HIGHLIGHT_IO_PROJECT_ID,
  serviceName: "tnr-backend",
  environment: process.env.NODE_ENV,
});

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
    onError: ({ path, error, req }) => {
      // Console.error
      console.error(
        `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}. Stack: ${
          error.stack
        }`,
      );
      // Highlight.io
      void Handlers.trpcOnError(
        { error, req: { ...req, headers: undefined } },
        {
          projectID: process.env.NEXT_PUBLIC_HIGHLIGHT_IO_PROJECT_ID,
          serviceName: "TheNinja-RPG",
          serviceVersion: "git-sha",
          environment: process.env.NODE_ENV,
        },
      );
    },
  });
};

export { handler as GET, handler as POST };
