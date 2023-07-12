import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { registrationSchema } from "../../../validators/register";
import { fetchVillage } from "./village";
import { secondsFromNow } from "../../../utils/time";
import { userData, userAttribute } from "../../../../drizzle/schema";

export const registerRouter = createTRPCRouter({
  // Create Character
  createCharacter: protectedProcedure
    .input(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      const village = await fetchVillage(ctx.drizzle, input.village);
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
      await ctx.drizzle.insert(userAttribute).values(
        unique_attributes.map((attribute) => ({
          id: nanoid(),
          attribute: attribute,
          userId: ctx.userId,
        }))
      );
      return await ctx.drizzle.insert(userData).values({
        userId: ctx.userId,
        username: input.username,
        gender: input.gender,
        villageId: input.village,
        approvedTos: 1,
        sector: village.sector,
        immunityUntil: secondsFromNow(24 * 3600),
      });
    }),
});
