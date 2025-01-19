import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import {
  createMedicalNinjaSquadSchema,
  healingActionSchema,
  joinMedicalNinjaSquadSchema,
  leaveMedicalNinjaSquadSchema,
} from "@/validators/medicalNinja";
import { eq, and, inArray, sql } from "drizzle-orm";
import { users } from "@/server/db/schema/users";
import { medicalNinjaSquads, medicalNinjaSquadMembers, type MedicalNinjaSquad } from "@/server/db/schema/medicalNinja";
import { type UserData } from "@/server/db/schema/users";
import { nanoid } from "nanoid";
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

    if (user.userId === "medical_ninja") {
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
        village_id: user.villageId || "",
        members: [ctx.userId],
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Create squad in database
      await ctx.drizzle.insert(medicalNinjaSquads).values({
        id: squad.id,
        name: squad.name,
        description: squad.description,
        leader_id: squad.leader_id,
        village_id: squad.village_id,
        created_at: squad.created_at,
        updated_at: squad.updated_at,
      });

      // Add leader as first member
      await ctx.drizzle.insert(medicalNinjaSquadMembers).values({
        squad_id: squad.id,
        user_id: squad.leader_id,
      });

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

      if (user.userId !== "medical_ninja") {
        throw serverError("FORBIDDEN", "Only medical ninjas can join medical ninja squads");
      }

      if (!["chunin", "jonin", "elder"].includes(user.rank)) {
        throw serverError("FORBIDDEN", "You must be at least a Chunin to join a medical ninja squad");
      }

      // Check if squad exists
      const squad = await ctx.drizzle.query.medicalNinjaSquads.findFirst({
        where: eq(medicalNinjaSquads.id, input.squad_id),
      });

      if (!squad) {
        throw serverError("NOT_FOUND", "Squad not found");
      }

      // Check if user is already in squad
      const membership = await ctx.drizzle.query.medicalNinjaSquadMembers.findFirst({
        where: and(
          eq(medicalNinjaSquadMembers.squad_id, input.squad_id),
          eq(medicalNinjaSquadMembers.user_id, ctx.userId)
        ),
      });

      if (membership) {
        throw serverError("BAD_REQUEST", "You are already a member of this squad");
      }

      // Add user to squad
      await ctx.drizzle.insert(medicalNinjaSquadMembers).values({
        squad_id: input.squad_id,
        user_id: ctx.userId,
      });

      return { success: true, message: "Successfully joined squad" } satisfies BaseServerResponse;
    }),

  leaveSquad: protectedProcedure
    .input(leaveMedicalNinjaSquadSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if user is in squad
      const membership = await ctx.drizzle.query.medicalNinjaSquadMembers.findFirst({
        where: and(
          eq(medicalNinjaSquadMembers.squad_id, input.squad_id),
          eq(medicalNinjaSquadMembers.user_id, ctx.userId)
        ),
      });

      if (!membership) {
        throw serverError("BAD_REQUEST", "You are not a member of this squad");
      }

      // Check if user is squad leader
      const squad = await ctx.drizzle.query.medicalNinjaSquads.findFirst({
        where: eq(medicalNinjaSquads.id, input.squad_id),
      });

      if (squad?.leader_id === ctx.userId) {
        // Delete squad if leader leaves
        await ctx.drizzle.delete(medicalNinjaSquads).where(eq(medicalNinjaSquads.id, input.squad_id));
        return { success: true, message: "Squad disbanded as leader left" } satisfies BaseServerResponse;
      }

      // Remove user from squad
      await ctx.drizzle.delete(medicalNinjaSquadMembers).where(and(
        eq(medicalNinjaSquadMembers.squad_id, input.squad_id),
        eq(medicalNinjaSquadMembers.user_id, ctx.userId)
      ));

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

      if (user.userId !== "medical_ninja") {
        throw serverError("FORBIDDEN", "Only medical ninjas can heal");
      }

      const isLegendary = user.medical_ninja_exp >= LEGENDARY_MEDICAL_NIN_EXP;

      if (input.type !== "health" && !isLegendary) {
        throw serverError("FORBIDDEN", "Only Legendary Medical Ninjas can restore chakra and stamina");
      }

      // Get target user
      const target = await ctx.drizzle.query.userData.findFirst({
        where: eq(users.userId, input.target_id),
      });

      if (!target) {
        throw serverError("NOT_FOUND", "Target user not found");
      }

      // Calculate healing amount based on medical ninja experience
      const healingMultiplier = isLegendary ? 2 : 1;
      const healingAmount = input.amount * healingMultiplier;

      // Update target's stats
      const updateData: Partial<UserData> = {};
      switch (input.type) {
        case "health":
          updateData.curHealth = Math.min(target.maxHealth, target.curHealth + healingAmount);
          break;
        case "chakra":
          updateData.curChakra = Math.min(target.maxChakra, target.curChakra + healingAmount);
          break;
        case "stamina":
          updateData.curStamina = Math.min(target.maxStamina, target.curStamina + healingAmount);
          break;
      }

      await ctx.drizzle
        .update(users)
        .set(updateData)
        .where(eq(users.userId, target.userId));

      // Award experience to the medical ninja
      const expGain = Math.floor(healingAmount * 10);
      await ctx.drizzle
        .update(users)
        .set({
          medical_ninja_exp: sql`${users.medical_ninja_exp} + ${expGain}`,
        })
        .where(eq(users.userId, ctx.userId));

      return {
        success: true,
        message: `Successfully healed target for ${healingAmount} ${input.type}`,
        data: {
          healingAmount,
          expGain,
          type: input.type,
        }
      } satisfies BaseServerResponse & {
        data: {
          healingAmount: number;
          expGain: number;
          type: "health" | "chakra" | "stamina";
        }
      };
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
      user.userId !== "medical_ninja"
    ) {
      throw serverError("FORBIDDEN", "You don't have permission to view medical ninja squads");
    }

    // Get all squads in user's village
    const squads = await ctx.drizzle.select().from(medicalNinjaSquads).where(eq(medicalNinjaSquads.village_id, user.villageId || "")).execute();

    // Get all squad members
    const squadMembers = await ctx.drizzle.select().from(medicalNinjaSquadMembers).where(inArray(
        medicalNinjaSquadMembers.squad_id,
        squads.map((s) => s.id)
      )).execute();

    // Map squads to include members
    const mappedSquads: MedicalNinjaSquad[] = squads.map((squad) => ({
      id: squad.id,
      name: squad.name,
      description: squad.description || undefined,
      leader_id: squad.leader_id,
      village_id: squad.village_id,
      members: squadMembers
        .filter((m) => m.squad_id === squad.id)
        .map((m) => m.user_id),
      created_at: squad.created_at,
      updated_at: squad.updated_at,
    }));

    return mappedSquads;
  }),
});
