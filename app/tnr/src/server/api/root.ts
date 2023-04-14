import { createTRPCRouter } from "./trpc";
import { profileRouter } from "./routers/profile";
import { registerRouter } from "./routers/register";
import { avatarRouter } from "./routers/avatar";
import { bugsRouter } from "./routers/bugs";
import { commentsRouter } from "./routers/comments";
import { villageRouter } from "./routers/village";
import { reportsRouter } from "./routers/reports";
import { forumRouter } from "./routers/forum";
import { travelRouter } from "./routers/travel";
import { paypalRouter } from "./routers/paypal";
import { bloodlineRouter } from "./routers/bloodline";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here
 */
export const appRouter = createTRPCRouter({
  profile: profileRouter,
  village: villageRouter,
  avatar: avatarRouter,
  bugs: bugsRouter,
  reports: reportsRouter,
  comments: commentsRouter,
  forum: forumRouter,
  paypal: paypalRouter,
  travel: travelRouter,
  register: registerRouter,
  bloodline: bloodlineRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
