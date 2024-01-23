import { createNextApiHandler } from "@trpc/server/adapters/next";
import { createTRPCContext } from "../../../server/api/trpc";
import { appRouter } from "../../../server/api/root";
import { Handlers, H } from "@highlight-run/node";

// Highlight.io init
H.init({
  projectID: process.env.NEXT_PUBLIC_HIGHLIGHT_IO_PROJECT_ID,
  serviceName: "tnr-backend",
  environment: process.env.NODE_ENV,
});

// Configure Vercel
export const config = {
  // runtime: "edge",
  regions: ["iad1"],
  memory: 3008,
  maxDuration: 10,
};

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  onError: ({ path, error, req }) => {
    // Console.error
    console.error(
      `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}. Stack: ${
        error.stack
      }`
    );
    // Highlight.io
    void Handlers.trpcOnError(
      { error, req },
      {
        projectID: process.env.NEXT_PUBLIC_HIGHLIGHT_IO_PROJECT_ID,
        serviceName: "TheNinja-RPG",
        serviceVersion: "git-sha",
        environment: process.env.NODE_ENV,
      }
    );
  },
});
