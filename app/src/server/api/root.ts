import { createTRPCRouter } from "./trpc";
import { profileRouter } from "./routers/profile";
import { registerRouter } from "./routers/register";
import { avatarRouter } from "./routers/avatar";
import { commentsRouter } from "./routers/comments";
import { villageRouter } from "./routers/village";
import { reportsRouter } from "./routers/reports";
import { forumRouter } from "./routers/forum";
import { travelRouter } from "./routers/travel";
import { paypalRouter } from "./routers/paypal";
import { bloodlineRouter } from "./routers/bloodline";
import { jutsuRouter } from "./routers/jutsu";
import { homeRouter } from "./routers/home";
import { itemRouter } from "./routers/item";
import { combatRouter } from "./routers/combat";
import { hospitalRouter } from "./routers/hospital";
import { logsRouter } from "./routers/logs";
import { dataRouter } from "./routers/data";
import { simulatorRouter } from "./routers/simulator";
import { miscRouter } from "./routers/misc";
import { questsRouter } from "./routers/quests";
import { openaiRouter } from "./routers/openai";
import { conceptartRouter } from "./routers/conceptart";
import { bankRouter } from "./routers/bank";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here
 */
export const appRouter = createTRPCRouter({
  profile: profileRouter,
  village: villageRouter,
  avatar: avatarRouter,
  reports: reportsRouter,
  comments: commentsRouter,
  forum: forumRouter,
  paypal: paypalRouter,
  travel: travelRouter,
  register: registerRouter,
  bloodline: bloodlineRouter,
  jutsu: jutsuRouter,
  home: homeRouter,
  item: itemRouter,
  combat: combatRouter,
  hospital: hospitalRouter,
  logs: logsRouter,
  data: dataRouter,
  simulator: simulatorRouter,
  misc: miscRouter,
  quests: questsRouter,
  openai: openaiRouter,
  conceptart: conceptartRouter,
  bank: bankRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
