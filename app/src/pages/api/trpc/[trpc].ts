import { createNextApiHandler } from "@trpc/server/adapters/next";
import { createTRPCContext } from "../../../server/api/trpc";
import { appRouter } from "../../../server/api/root";

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
  onError: ({ path, error }) => {
    console.error(`❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`);
  },
});
