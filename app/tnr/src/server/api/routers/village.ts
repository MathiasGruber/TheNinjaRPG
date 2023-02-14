import { createTRPCRouter, publicProcedure } from "../trpc";

export const villageRouter = createTRPCRouter({
  // Get all villages
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.prisma.village.findMany();
  }),
});
