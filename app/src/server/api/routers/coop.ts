import { dungeonRouter } from "@/server/api/routers/dungeon";
import { questPartyRouter } from "@/server/api/routers/questParty";
import { createTRPCRouter } from "@/server/api/trpc";

/** Co-op activities share party and encounter services while retaining their own content rules. */
export const coopRouter = createTRPCRouter({
  quest: questPartyRouter,
  dungeon: dungeonRouter,
});
