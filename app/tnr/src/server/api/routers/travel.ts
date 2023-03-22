import { z } from "zod";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";

export const travelRouter = createTRPCRouter({
  // Move user to new location
  move: protectedProcedure
    .input(
      z.object({
        longitude: z.number(),
        latitude: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { longitude, latitude } = input;
      const userData = await ctx.prisma.userData.findUniqueOrThrow({
        where: { userId: ctx.session.user.id },
        select: {
          longitude: true,
          latitude: true,
        },
      });
      const distance = Math.max(
        Math.abs(userData.longitude - longitude),
        Math.abs(userData.latitude - latitude)
      );
      if (distance === 0) {
        return input;
      } else if (distance === 1) {
        await ctx.prisma.userData.update({
          where: { userId: ctx.session.user.id },
          data: {
            longitude,
            latitude,
          },
        });
        return input;
      } else {
        return { longitude: userData.longitude, latitude: userData.latitude };
      }

      // const { userId } = ctx.req.session;
      // const user = await ctx.db.user.findUnique({
      //   where: { id: userId },
      // });
      // if (!user) {
      //   throw new Error("User not found");
      // }
      // await ctx.db.user.update({
      //   where: { id: userId },
      //   data: {
      //     longitude,
      //     latitude,
      //   },
      // });
      // return true;
    }),
});
