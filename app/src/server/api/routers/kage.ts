import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { userData, village } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { initiateBattle, determineArenaBackground } from "@/routers/combat";
import { fetchVillage } from "@/routers/village";
import { fetchUser } from "@/routers/profile";
import { canChallengeKage } from "@/utils/kage";

export const kageRouter = createTRPCRouter({
  fightKage: protectedProcedure
    .input(z.object({ kageId: z.string(), villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage, village] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.kageId),
        fetchVillage(ctx.drizzle, input.villageId),
      ]);
      // Guards
      if (!village) return errorResponse("Village not found");
      if (kage.villageId !== village.id) return errorResponse("No longer kage");
      if (kage.villageId !== user.villageId) return errorResponse("Wrong village");
      if (!canChallengeKage(user)) return errorResponse("Not eligible to challenge");
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
  resignKage: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Destructure
      const villageId = input.villageId;
      // Fetch
      const [user, uVillage, elder] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
        ctx.drizzle.query.userData.findFirst({
          where: and(eq(userData.villageId, villageId), eq(userData.rank, "ELDER")),
        }),
      ]);
      // Guards
      if (!elder) return errorResponse("No elder found");
      if (!user) return errorResponse("User not found");
      if (!uVillage) return errorResponse("Village not found");
      if (user.villageId !== villageId) return errorResponse("Wrong village");
      if (user.userId !== uVillage?.kageId) return errorResponse("Not kage");
      // Start the battle
      await ctx.drizzle
        .update(village)
        .set({ kageId: elder.userId })
        .where(eq(village.id, user.villageId));
      return { success: true, message: "You have resigned as kage" };
    }),
});
