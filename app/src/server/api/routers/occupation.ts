import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq } from "drizzle-orm";
import { userData } from "@/drizzle/schema";
import { hasRequiredRank } from "@/libs/train";
import { MEDNIN_MIN_RANK } from "@/drizzle/constants";

export const occupationRouter = createTRPCRouter({
  signUpMedicalNinja: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.query.userData.findFirst({
      where: eq(userData.userId, ctx.auth.userId),
    });

    if (!user) {
      return errorResponse("User not found");
    }

    if (!hasRequiredRank(user.rank, MEDNIN_MIN_RANK)) {
      return errorResponse(`You need to be at least a ${MEDNIN_MIN_RANK} to become a Medical Ninja`);
    }

    if (user.occupation !== "NONE") {
      return errorResponse("You already have an occupation");
    }

    await ctx.db
      .update(userData)
      .set({
        occupation: "MEDICAL_NINJA",
      })
      .where(eq(userData.userId, ctx.auth.userId));

    return {
      success: true,
      message: "You are now a Medical Ninja",
    };
  }),

  quitOccupation: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.query.userData.findFirst({
      where: eq(userData.userId, ctx.auth.userId),
    });

    if (!user) {
      return errorResponse("User not found");
    }

    if (user.occupation === "NONE") {
      return errorResponse("You don't have an occupation to quit");
    }

    await ctx.db
      .update(userData)
      .set({
        occupation: "NONE",
        medicalNinjaSquadId: null,
      })
      .where(eq(userData.userId, ctx.auth.userId));

    return {
      success: true,
      message: "You have quit your occupation",
    };
  }),
});
