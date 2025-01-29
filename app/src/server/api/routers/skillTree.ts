import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { skillTreeTierSchema } from "@/validators/skillTree";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { skillTree, userData } from "@/server/db/schema";
import { randomUUID } from "crypto";
import type { InferSelectModel } from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

type UserData = InferSelectModel<typeof userData>;
type SkillTree = InferSelectModel<typeof skillTree>;
type UserDataTable = PgTableWithColumns<typeof userData>;
type SkillTreeTable = PgTableWithColumns<typeof skillTree>;



const TIER_COSTS = {
  1: 1,
  2: 2,
  3: 3,
  SPECIAL: 5,
};



export const skillTreeRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }): Promise<SkillTree | undefined> => {
    const skillTreeData = await ctx.db.query.skillTree.findFirst({
      where: (st: SkillTreeTable) => eq(st.userId, ctx.auth.userId),
    });

    return skillTreeData;
  }),

  update: protectedProcedure
    .input(
      z.object({
        selectedSkills: z.array(skillTreeTierSchema),
      })
    )
    .mutation(async ({ ctx, input }): Promise<SkillTree> => {
      const user = await ctx.db.query.userData.findFirst({
        where: (u: UserDataTable) => eq(u.userId, ctx.auth.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check if user is Chuunin or higher
      if (user.rank < 2 && user.prestige === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be Chuunin or higher to use skill tree",
        });
      }

      const skillTreeData = await ctx.db.query.skillTree.findFirst({
        where: (st: SkillTreeTable) => eq(st.userId, ctx.auth.userId),
      });

      // Calculate available points based on level
      const maxPoints = user.level + (user.prestige > 0 ? 5 : 0);
      const availablePoints = Math.min(20, maxPoints);

      // Validate points usage
      let usedPoints = 0;
      const tier1Skills = new Set<string>();

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
          id: skillTreeData?.id ?? randomUUID(),
          userId: ctx.auth.userId,
          points: availablePoints - usedPoints,
          resetCount: skillTreeData?.resetCount ?? 0,
          selectedSkills: input.selectedSkills,
        })
        .onConflictDoUpdate({
          target: [skillTree.userId],
          set: {
            points: availablePoints - usedPoints,
            selectedSkills: input.selectedSkills,
          },
        });

      return updatedSkillTree;
    }),

  reset: protectedProcedure.mutation(async ({ ctx }): Promise<{ success: boolean }> => {
    const skillTreeData = await ctx.db.query.skillTree.findFirst({
      where: (st: SkillTreeTable) => eq(st.userId, ctx.auth.userId),
    });

    if (!skillTreeData) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Skill tree not found",
      });
    }

    if (skillTreeData.resetCount > 0) {
      // Check if user has enough reputation
      const user = await ctx.db.query.userData.findFirst({
        where: (u: UserDataTable) => eq(u.userId, ctx.auth.userId),
      });

      if (!user || user.reputation < 30) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enough reputation to reset skill tree",
        });
      }

      // Deduct reputation
      await ctx.db
        .update(userData)
        .set({ reputation: user.reputation - 30 })
        .where(eq(userData.userId, ctx.auth.userId));
    }

    // Reset skill tree
    await ctx.db
      .update(skillTree)
      .set({
        points: 0,
        selectedSkills: [],
        resetCount: skillTreeData.resetCount + 1,
      })
      .where(eq(skillTree.userId, ctx.auth.userId));

    return { success: true };
  }),
});
