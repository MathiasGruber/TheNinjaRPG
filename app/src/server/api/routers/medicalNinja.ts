import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { medicalNinjaRanks, medicalNinjas, medicalNinjaSquads, medicalNinjaSquadMembers, type MedicalNinja, type MedicalNinjaSquad, type MedicalNinjaSquadMember } from "~/server/db/schema/medicalNinja";
import { eq, and, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { UserWithRelations } from "~/server/api/routers/profile";
import type { User } from "~/server/db/schema/users";
import type { Village } from "~/server/db/schema/villages";

const rankExperienceRequirements = {
  [medicalNinjaRanks.TRAINEE]: 0,
  [medicalNinjaRanks.APPRENTICE]: 10000,
  [medicalNinjaRanks.SKILLED]: 50000,
  [medicalNinjaRanks.EXPERT]: 150000,
  [medicalNinjaRanks.MASTER]: 400000,
  [medicalNinjaRanks.LEGENDARY]: 700000,
} as const;

export const medicalNinjaRouter = createTRPCRouter({
  join: protectedProcedure.mutation(async ({ ctx }) => {
    const existingMedicalNinja = await ctx.db
      .select()
      .from(medicalNinjas)
      .where(eq(medicalNinjas.userId, ctx.session.user.id))
      .limit(1);

    if (existingMedicalNinja.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You are already a medical ninja",
      });
    }

    await ctx.db.insert(medicalNinjas).values({
      userId: ctx.session.user.id,
    });

    return { success: true };
  }),

  leave: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(medicalNinjas)
      .where(eq(medicalNinjas.userId, ctx.session.user.id));

    return { success: true };
  }),

  addExperience: protectedProcedure
    .input(z.object({ amount: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const medicalNinja = await ctx.db
        .select()
        .from(medicalNinjas)
        .where(eq(medicalNinjas.userId, ctx.session.user.id))
        .limit(1);

      if (medicalNinja.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You are not a medical ninja",
        });
      }

      const newExperience = medicalNinja[0].experience + input.amount;
      let newRank = medicalNinja[0].rank;

      // Check for rank up
      for (const [rank, reqExp] of Object.entries(rankExperienceRequirements)) {
        if (newExperience >= reqExp) {
          newRank = rank as keyof typeof medicalNinjaRanks;
        }
      }

      await ctx.db
        .update(medicalNinjas)
        .set({
          experience: newExperience,
          rank: newRank,
        })
        .where(eq(medicalNinjas.userId, ctx.session.user.id));

      return { success: true, newExperience, newRank };
    }),

  createSquad: protectedProcedure
    .input(z.object({ name: z.string().min(3).max(50) }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is Kage
      const isKage = true; // TODO: Add proper Kage check

      if (!isKage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the Kage can create medical ninja squads",
        });
      }

      // Check squad limit (5 per village)
      const squadCount = await ctx.db
        .select({ value: count() })
        .from(medicalNinjaSquads)
        .where(eq(medicalNinjaSquads.villageId, ctx.session.user.villageId))
        .limit(1);

      if (squadCount[0].value >= 5) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Village has reached the maximum number of medical ninja squads",
        });
      }

      const squadId = nanoid();
      await ctx.db.insert(medicalNinjaSquads).values({
        id: squadId,
        name: input.name,
        villageId: ctx.session.user.villageId,
      });

      return { success: true, squadId };
    }),

  deleteSquad: protectedProcedure
    .input(z.object({ squadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is Kage
      const isKage = true; // TODO: Add proper Kage check

      if (!isKage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the Kage can delete medical ninja squads",
        });
      }

      await ctx.db
        .delete(medicalNinjaSquads)
        .where(
          and(
            eq(medicalNinjaSquads.id, input.squadId),
            eq(medicalNinjaSquads.villageId, ctx.session.user.villageId)
          )
        );

      return { success: true };
    }),

  joinSquad: protectedProcedure
    .input(z.object({ squadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is a medical ninja
      const medicalNinja = await ctx.db
        .select()
        .from(medicalNinjas)
        .where(eq(medicalNinjas.userId, ctx.session.user.id))
        .limit(1);

      if (medicalNinja.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You must be a medical ninja to join a squad",
        });
      }

      // Check squad member limit (10 per squad)
      const memberCount = await ctx.db
        .select({ value: count() })
        .from(medicalNinjaSquadMembers)
        .where(eq(medicalNinjaSquadMembers.squadId, input.squadId))
        .limit(1);

      if (memberCount[0].value >= 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Squad has reached the maximum number of members",
        });
      }

      await ctx.db.insert(medicalNinjaSquadMembers).values({
        squadId: input.squadId,
        userId: ctx.session.user.id,
      });

      return { success: true };
    }),

  leaveSquad: protectedProcedure
    .input(z.object({ squadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(medicalNinjaSquadMembers)
        .where(
          and(
            eq(medicalNinjaSquadMembers.squadId, input.squadId),
            eq(medicalNinjaSquadMembers.userId, ctx.session.user.id)
          )
        );

      return { success: true };
    }),

  setLeader: protectedProcedure
    .input(z.object({ squadId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is Kage
      const isKage = true; // TODO: Add proper Kage check

      if (!isKage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the Kage can set squad leaders",
        });
      }

      await ctx.db
        .update(medicalNinjaSquads)
        .set({ leaderId: input.userId })
        .where(
          and(
            eq(medicalNinjaSquads.id, input.squadId),
            eq(medicalNinjaSquads.villageId, ctx.session.user.villageId)
          )
        );

      return { success: true };
    }),

  setCoLeader: protectedProcedure
    .input(z.object({ squadId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is Kage or squad leader
      const squad = await ctx.db
        .select()
        .from(medicalNinjaSquads)
        .where(eq(medicalNinjaSquads.id, input.squadId))
        .limit(1);

      if (squad.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Squad not found",
        });
      }

      const isKage = true; // TODO: Add proper Kage check
      const isLeader = squad[0].leaderId === ctx.session.user.id;

      if (!isKage && !isLeader) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the Kage or squad leader can set co-leaders",
        });
      }

      await ctx.db
        .update(medicalNinjaSquads)
        .set({ coLeaderId: input.userId })
        .where(eq(medicalNinjaSquads.id, input.squadId));

      return { success: true };
    }),

  kickMember: protectedProcedure
    .input(z.object({ squadId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is Kage, squad leader, or co-leader
      const squad = await ctx.db
        .select()
        .from(medicalNinjaSquads)
        .where(eq(medicalNinjaSquads.id, input.squadId))
        .limit(1);

      if (squad.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Squad not found",
        });
      }

      const isKage = true; // TODO: Add proper Kage check
      const isLeader = squad[0].leaderId === ctx.session.user.id;
      const isCoLeader = squad[0].coLeaderId === ctx.session.user.id;

      if (!isKage && !isLeader && !isCoLeader) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the Kage, squad leader, or co-leader can kick members",
        });
      }

      await ctx.db
        .delete(medicalNinjaSquadMembers)
        .where(
          and(
            eq(medicalNinjaSquadMembers.squadId, input.squadId),
            eq(medicalNinjaSquadMembers.userId, input.userId)
          )
        );

      return { success: true };
    }),
});
