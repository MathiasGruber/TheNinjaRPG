import { createTRPCRouter, protectedProcedure } from "../trpc";
import { registrationSchema } from "../../../validators/register";

export const registerRouter = createTRPCRouter({
  // Create Character
  createCharacter: protectedProcedure
    .input(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch village
      const village = await ctx.prisma.village.findUniqueOrThrow({
        where: { id: input.village },
      });
      // Create user
      const user = await ctx.prisma.userData.create({
        data: {
          villageId: input.village,
          username: input.username,
          gender: input.gender,
          userId: ctx.userId,
          approved_tos: true,
          sector: village.sector,
        },
      });
      // Unique attributes
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
      // Create user attributes
      await ctx.prisma.userAttribute.createMany({
        data: unique_attributes.map((attribute) => ({
          attribute,
          userId: ctx.userId,
        })),
        skipDuplicates: true,
      });
      return user;
    }),
});
