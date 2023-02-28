import { createTRPCRouter } from "./trpc";
import { exampleRouter } from "./routers/example";
import { profileRouter } from "./routers/profile";
import { avatarRouter } from "./routers/avatar";
import { bugsRouter } from "./routers/bugs";
import { commentsRouter } from "./routers/comments";
import { villageRouter } from "./routers/village";
import { reportsRouter } from "./routers/reports";
import { notificationsRouter } from "./routers/notifications";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here
 */
export const appRouter = createTRPCRouter({
  example: exampleRouter,
  profile: profileRouter,
  village: villageRouter,
  avatar: avatarRouter,
  bugs: bugsRouter,
  reports: reportsRouter,
  comments: commentsRouter,
  notifications: notificationsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
