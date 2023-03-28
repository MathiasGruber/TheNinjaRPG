import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const villageRouter = createTRPCRouter({
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.prisma.village.findMany();
  }),
  get: publicProcedure
    .input(
      z.object({
        id: z.string().cuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const village = await ctx.prisma.village.findUniqueOrThrow({
        where: { id: input.id },
      });
      const structures = await ctx.prisma.villageStructure.findMany({
        where: { villageId: input.id },
      });
      const population = await ctx.prisma.userData.count({
        where: { villageId: input.id },
      });
      return { village, structures, population };
    }),
});
