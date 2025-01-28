/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/prefer-optional-chain */

// TODO: Fix type inference for tRPC mutations and queries
// Currently, the type inference for tRPC mutations and queries is not working correctly
// This is a known issue and will be fixed in a future update
// For now, we need to use type assertions to make TypeScript happy
// See: https://github.com/trpc/trpc/issues/1343

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { medicalNinjaSquad, userData } from "@/drizzle/schema";
import { VILLAGE_SYNDICATE_ID } from "@/drizzle/constants";

export const medicalNinjaSquadRouter = createTRPCRouter({
  getMedicalNinjaSquads: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.userData.findFirst({
      where: eq(userData.userId, ctx.auth.userId),
      with: {
        village: true,
      },
    });

    if (!user || !user.villageId || user.villageId === VILLAGE_SYNDICATE_ID) {
      return [];
    }

    return ctx.db.query.medicalNinjaSquad.findMany({
      where: eq(medicalNinjaSquad.villageId, user.villageId),
      with: {
        leader: true,
        coLeader: true,
        members: true,
      },
    });
  }),

  createMedicalNinjaSquad: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        image: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.userData.findFirst({
        where: eq(userData.userId, ctx.auth.userId),
        with: {
          village: true,
        },
      });

      if (!user || !user.villageId || user.villageId === VILLAGE_SYNDICATE_ID) {
        return {
          success: false,
          message: "You must be in a village to create a medical ninja squad",
        };
      }

      if (user.rank !== "ELDER") {
        return {
          success: false,
          message: "Only the Kage can create medical ninja squads",
        };
      }

      const existingSquads = await ctx.db.query.medicalNinjaSquad.findMany({
        where: eq(medicalNinjaSquad.villageId, user.villageId),
      });

      if (existingSquads.length >= 5) {
        return {
          success: false,
          message: "Your village already has the maximum number of medical ninja squads",
        };
      }

      const existingSquadWithName = await ctx.db.query.medicalNinjaSquad.findFirst({
        where: eq(medicalNinjaSquad.name, input.name),
      });

      if (existingSquadWithName) {
        return {
          success: false,
          message: "A medical ninja squad with that name already exists",
        };
      }

      await ctx.db.insert(medicalNinjaSquad).values({
        id: crypto.randomUUID(),
        name: input.name,
        image: input.image,
        villageId: user.villageId,
      });

      return {
        success: true,
        message: "Medical ninja squad created successfully",
      };
    }),

  deleteMedicalNinjaSquad: protectedProcedure
    .input(
      z.object({
        squadId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.userData.findFirst({
        where: eq(userData.userId, ctx.auth.userId),
      });

      if (!user || user.rank !== "ELDER") {
        return {
          success: false,
          message: "Only the Kage can delete medical ninja squads",
        };
      }

      const squad = await ctx.db.query.medicalNinjaSquad.findFirst({
        where: eq(medicalNinjaSquad.id, input.squadId),
      });

      if (!squad) {
        return {
          success: false,
          message: "Medical ninja squad not found",
        };
      }

      await ctx.db.delete(medicalNinjaSquad).where(eq(medicalNinjaSquad.id, input.squadId));

      return {
        success: true,
        message: "Medical ninja squad deleted successfully",
      };
    }),

  kickMedicalNinjaSquadMember: protectedProcedure
    .input(
      z.object({
        squadId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.userData.findFirst({
        where: eq(userData.userId, ctx.auth.userId),
      });

      const squad = await ctx.db.query.medicalNinjaSquad.findFirst({
        where: eq(medicalNinjaSquad.id, input.squadId),
      });

      if (!squad) {
        return {
          success: false,
          message: "Medical ninja squad not found",
        };
      }

      if (
        !user ||
        (user.rank !== "ELDER" &&
          squad.leaderId !== user.userId &&
          squad.coLeaderId !== user.userId)
      ) {
        return {
          success: false,
          message: "You don't have permission to kick members",
        };
      }

      await ctx.db
        .update(userData)
        .set({
          medicalNinjaSquadId: null,
          occupation: "NONE",
        })
        .where(eq(userData.userId, input.userId));

      return {
        success: true,
        message: "Member kicked successfully",
      };
    }),

  promoteMedicalNinjaSquadLeader: protectedProcedure
    .input(
      z.object({
        squadId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.userData.findFirst({
        where: eq(userData.userId, ctx.auth.userId),
      });

      const squad = await ctx.db.query.medicalNinjaSquad.findFirst({
        where: eq(medicalNinjaSquad.id, input.squadId),
      });

      if (!squad) {
        return {
          success: false,
          message: "Medical ninja squad not found",
        };
      }

      if (!user || (user.rank !== "ELDER" && squad.leaderId !== user.userId)) {
        return {
          success: false,
          message: "You don't have permission to promote leaders",
        };
      }

      await ctx.db
        .update(medicalNinjaSquad)
        .set({
          leaderId: input.userId,
        })
        .where(eq(medicalNinjaSquad.id, input.squadId));

      return {
        success: true,
        message: "Leader promoted successfully",
      };
    }),

  promoteMedicalNinjaSquadCoLeader: protectedProcedure
    .input(
      z.object({
        squadId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.userData.findFirst({
        where: eq(userData.userId, ctx.auth.userId),
      });

      const squad = await ctx.db.query.medicalNinjaSquad.findFirst({
        where: eq(medicalNinjaSquad.id, input.squadId),
      });

      if (!squad) {
        return {
          success: false,
          message: "Medical ninja squad not found",
        };
      }

      if (!user || (user.rank !== "ELDER" && squad.leaderId !== user.userId)) {
        return {
          success: false,
          message: "You don't have permission to promote co-leaders",
        };
      }

      await ctx.db
        .update(medicalNinjaSquad)
        .set({
          coLeaderId: input.userId,
        })
        .where(eq(medicalNinjaSquad.id, input.squadId));

      return {
        success: true,
        message: "Co-leader promoted successfully",
      };
    }),
});
