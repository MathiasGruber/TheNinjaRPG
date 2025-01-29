import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { skillTreeSchema, skillTreeTierSchema } from "~/validators/skillTree";
import { TRPCError } from "@trpc/server";

const TIER_COSTS = {
  1: 1,
  2: 2,
  3: 3,
  SPECIAL: 5,
};

const TIER_BOOSTS = {
  1: 5,
  2: 10,
  3: 15,
};

const SPECIAL_BOOSTS = {
  STUN_RESISTANCE: 30,
  ABSORB: 10,
  REFLECT: 10,
  LIFE_STEAL: 10,
  SEAL_PREVENT: 15,
};

export const skillTreeRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const skillTree = await ctx.db.query.skillTree.findFirst({
      where: (skillTree, { eq }) => eq(skillTree.userId, ctx.auth.userId),
    });

    return skillTree;
  }),

  update: protectedProcedure
    .input(
      z.object({
        selectedSkills: z.array(skillTreeTierSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, ctx.auth.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check if user is Chuunin or higher
      if (user.rank < 2) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be Chuunin or higher to use skill tree",
        });
      }

      const skillTree = await ctx.db.query.skillTree.findFirst({
        where: (skillTree, { eq }) => eq(skillTree.userId, ctx.auth.userId),
      });

      // Calculate available points based on level
      const maxPoints = user.level + (user.prestige > 0 ? 5 : 0);
      const availablePoints = Math.min(20, maxPoints);

      // Validate points usage
      let usedPoints = 0;
      const tier1Skills = new Set();

      for (const skill of input.selectedSkills) {
        if (skill.isSpecial) {
          usedPoints += TIER_COSTS.SPECIAL;
        } else {
          usedPoints += TIER_COSTS[skill.tier as keyof typeof TIER_COSTS];
          if (skill.tier === 1) {
            tier1Skills.add(skill.type);
          }
        }
      }

      if (usedPoints > availablePoints) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough skill points available",
        });
      }

      // Validate tier requirements
      for (const skill of input.selectedSkills) {
        if (skill.tier > 1 && !skill.isSpecial) {
          // Check if there's a tier 1 skill of the same type
          const hasPrerequisite = input.selectedSkills.some(
            (s) => s.tier === 1 && s.type === skill.type
          );
          if (!hasPrerequisite) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Must have tier 1 skill before selecting tier ${skill.tier} skill`,
            });
          }
        }
      }

      // Update or create skill tree
      const updatedSkillTree = await ctx.db
        .insert(skillTree)
        .values({
          userId: ctx.auth.userId,
          points: availablePoints - usedPoints,
          resetCount: skillTree?.resetCount ?? 0,
          selectedSkills: input.selectedSkills,
        })
        .onConflictDoUpdate({
          target: skillTree.userId,
          set: {
            points: availablePoints - usedPoints,
            selectedSkills: input.selectedSkills,
          },
        });

      return updatedSkillTree;
    }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    const skillTree = await ctx.db.query.skillTree.findFirst({
      where: (skillTree, { eq }) => eq(skillTree.userId, ctx.auth.userId),
    });

    if (!skillTree) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Skill tree not found",
      });
    }

    if (skillTree.resetCount > 0) {
      // Check if user has enough reputation
      const user = await ctx.db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, ctx.auth.userId),
      });

      if (!user || user.reputation < 30) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enough reputation to reset skill tree",
        });
      }

      // Deduct reputation
      await ctx.db
        .update(users)
        .set({ reputation: user.reputation - 30 })
        .where(eq(users.id, ctx.auth.userId));
    }

    // Reset skill tree
    await ctx.db
      .update(skillTree)
      .set({
        points: 0,
        selectedSkills: [],
        resetCount: skillTree.resetCount + 1,
      })
      .where(eq(skillTree.userId, ctx.auth.userId));

    return { success: true };
  }),
});
