import { createTRPCRouter } from "./trpc";
import { exampleRouter } from "./routers/example";
import { profileRouter } from "./routers/profile";
import { villageRouter } from "./routers/village";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here
 */
export const appRouter = createTRPCRouter({
  example: exampleRouter,
  profile: profileRouter,
  village: villageRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
