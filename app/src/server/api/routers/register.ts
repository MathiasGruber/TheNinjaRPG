import { nanoid } from "nanoid";
import { eq, sql } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { registrationSchema } from "@/validators/register";
import { secondsFromNow } from "@/utils/time";
import { getMostCommonElement } from "@/utils/array";
import { userData, village, userAttribute } from "@/drizzle/schema";

export const registerRouter = createTRPCRouter({
  // Create Character
  createCharacter: protectedProcedure
    .input(registrationSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const villageName = getMostCommonElement([
        input.question1,
        input.question2,
        input.question3,
        input.question4,
        input.question5,
        input.question6,
      ]);
      const villageData = await ctx.drizzle.query.village.findFirst({
        where: eq(village.name, villageName || "none"),
      });

      // Guard
      if (!villageData) return errorResponse("Village not found");
      if (!villageData.allianceSystem) return errorResponse("Missing alliance system");
      if (villageData.type !== "VILLAGE")
        return errorResponse("Can only join villages");

      // Mutate
      const unique_attributes = [
        ...new Set([
          input.attribute_1,
          input.attribute_2,
          input.attribute_3,
          input.hair_color + " hair",
          input.eye_color + " eyes",
          input.skin_color + " skin",
        ]),
      ];
      await ctx.drizzle
        .delete(userAttribute)
        .where(eq(userAttribute.userId, ctx.userId));
      await Promise.all([
        ctx.drizzle.insert(userAttribute).values(
          unique_attributes.map((attribute) => ({
            id: nanoid(),
            attribute: attribute,
            userId: ctx.userId,
          })),
        ),
        ctx.drizzle.insert(userData).values({
          userId: ctx.userId,
          lastIp: ctx.userIp,
          recruiterId: input.recruiter_userid,
          username: input.username,
          gender: input.gender,
          villageId: villageData.id,
          approvedTos: 1,
          sector: villageData.sector,
          immunityUntil: secondsFromNow(24 * 3600),
        }),
      ]);
      if (input.recruiter_userid) {
        await ctx.drizzle
          .update(userData)
          .set({ nRecruited: sql`${userData.nRecruited} + 1` })
          .where(eq(userData.userId, input.recruiter_userid));
      }
      return { success: true, message: "Character created" };
    }),
});
