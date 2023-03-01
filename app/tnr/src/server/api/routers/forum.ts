import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "../trpc";

export const forumRouter = createTRPCRouter({
  // Get all boards in the system
  getAll: publicProcedure.query(async ({ ctx }) => {
    const boards = await ctx.prisma.forumBoard.findMany({
      orderBy: [
        {
          createdAt: "asc",
        },
      ],
    });
    return boards;
  }),
});
