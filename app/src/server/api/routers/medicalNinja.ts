import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import {
  createMedicalNinjaSquadSchema,
  healingActionSchema,
  joinMedicalNinjaSquadSchema,
  leaveMedicalNinjaSquadSchema,
} from "~/validators/medicalNinja";
import { eq } from "drizzle-orm";
import { users } from "~/server/db/schema";
import { nanoid } from "nanoid";
import type { MedicalNinjaSquad } from "~/types/medicalNinja";
import type { BaseServerResponse } from "../trpc";

const LEGENDARY_MEDICAL_NIN_EXP = 700000;

export const medicalNinjaRouter = createTRPCRouter({
  signUp: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.drizzle.query.userData.findFirst({
      where: eq(users.userId, ctx.userId),
    });

    if (!user) {
      throw serverError("NOT_FOUND", "User not found");
    }

    if (user.occupation === "medical_ninja") {
      throw serverError("BAD_REQUEST", "You are already a medical ninja");
    }

    await ctx.drizzle
      .update(users)
      .set({
        occupation: "medical_ninja",
        medical_ninja_exp: 0,
      })
      .where(eq(users.userId, ctx.userId));

    return { success: true, message: "Successfully signed up as a medical ninja" } satisfies BaseServerResponse;
  }),

  leaveOccupation: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.drizzle
      .update(users)
      .set({
        occupation: null,
        medical_ninja_exp: 0,
      })
      .where(eq(users.userId, ctx.userId));

    return { success: true, message: "Successfully left occupation" } satisfies BaseServerResponse;
  }),

  createSquad: protectedProcedure
    .input(createMedicalNinjaSquadSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.drizzle.query.userData.findFirst({
        where: eq(users.userId, ctx.userId),
      });

      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }

      if (!["kage", "elder"].includes(user.rank)) {
        throw serverError("FORBIDDEN", "Only Kage and Elders can create medical ninja squads");
      }

      const squad: MedicalNinjaSquad = {
        id: nanoid(),
        name: input.name,
        description: input.description,
        leader_id: ctx.userId,
        village_id: user.villageId,
        members: [ctx.userId],
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Create squad logic here
      return { success: true, message: "Squad created successfully", squad } satisfies BaseServerResponse & { squad: MedicalNinjaSquad };
    }),

  joinSquad: protectedProcedure
    .input(joinMedicalNinjaSquadSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.drizzle.query.userData.findFirst({
        where: eq(users.userId, ctx.userId),
      });

      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }

      if (user.occupation !== "medical_ninja") {
        throw serverError("FORBIDDEN", "Only medical ninjas can join medical ninja squads");
      }

      if (!["chunin", "jonin", "elder"].includes(user.rank)) {
        throw serverError("FORBIDDEN", "You must be at least a Chunin to join a medical ninja squad");
      }

      // Join squad logic here
      return { success: true, message: "Successfully joined squad" } satisfies BaseServerResponse;
    }),

  leaveSquad: protectedProcedure
    .input(leaveMedicalNinjaSquadSchema)
    .mutation(async ({ _ctx, _input }) => {
      // Leave squad logic here
      return { success: true, message: "Successfully left squad" } satisfies BaseServerResponse;
    }),

  heal: protectedProcedure
    .input(healingActionSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.drizzle.query.userData.findFirst({
        where: eq(users.userId, ctx.userId),
      });

      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }

      if (user.occupation !== "medical_ninja") {
        throw serverError("FORBIDDEN", "Only medical ninjas can heal");
      }

      const isLegendary = user.medical_ninja_exp >= LEGENDARY_MEDICAL_NIN_EXP;

      if (input.type !== "health" && !isLegendary) {
        throw serverError("FORBIDDEN", "Only Legendary Medical Ninjas can restore chakra and stamina");
      }

      // Healing logic here
      return { success: true, message: "Successfully healed target" } satisfies BaseServerResponse;
    }),

  getSquads: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.drizzle.query.userData.findFirst({
      where: eq(users.userId, ctx.userId),
    });

    if (!user) {
      throw serverError("NOT_FOUND", "User not found");
    }

    if (
      !["kage", "elder"].includes(user.rank) &&
      user.occupation !== "medical_ninja"
    ) {
      throw serverError("FORBIDDEN", "You don't have permission to view medical ninja squads");
    }

    // Get squads logic here
    const squads: MedicalNinjaSquad[] = [
      {
        id: "example",
        name: "Example Squad",
        description: "An example medical ninja squad",
        leader_id: ctx.userId,
        village_id: user.villageId,
        members: [ctx.userId],
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    return squads;
  }),
});
