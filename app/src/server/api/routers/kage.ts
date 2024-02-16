import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { serverError } from "../trpc";
import { initiateBattle, determineArenaBackground } from "@/routers/combat";
import { fetchVillage } from "@/routers/village";
import { fetchUser } from "@/routers/profile";
import { canChallengeKage } from "@/utils/kage";

export const kageRouter = createTRPCRouter({
  fightKage: protectedProcedure
    .input(z.object({ kageId: z.string(), villageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage, village] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.kageId),
        fetchVillage(ctx.drizzle, input.villageId),
      ]);
      // Guards
      if (!village) throw serverError("NOT_FOUND", "Village not found");
      if (kage.villageId !== village.id) {
        throw serverError("FORBIDDEN", "No longer kage");
      }
      if (kage.villageId !== user.villageId) {
        throw serverError("FORBIDDEN", "Not in same village");
      }
      if (!canChallengeKage(user)) {
        throw serverError("FORBIDDEN", "Not eligible to challenge kage");
      }
      // Start the battle
      return await initiateBattle(
        {
          userId: ctx.userId,
          targetId: kage.userId,
          client: ctx.drizzle,
        },
        "KAGE",
        determineArenaBackground(village?.name || "Unknown"),
      );
    }),
});
