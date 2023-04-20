import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { publicState, allState } from "../../../libs/combat/types";
import { type ReturnedUserState } from "../../../libs/combat/types";

export const combatRouter = createTRPCRouter({
  // Get battle and any users in the battle
  getBattle: protectedProcedure
    .input(z.object({ battleId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      // Distinguish between public and non-public user state
      const battle = await ctx.prisma.battle.findUniqueOrThrow({
        where: { id: input.battleId },
      });
      // Hide private state of non-session user
      const parsedBattle = {
        ...battle,
        usersState: (battle.usersState as unknown as ReturnedUserState[]).map(
          (user) => {
            if (user.userId !== ctx.userId) {
              return Object.fromEntries(
                publicState.map((key) => [key, user[key]])
              ) as unknown as ReturnedUserState;
            } else {
              return Object.fromEntries(
                allState.map((key) => [key, user[key]])
              ) as unknown as ReturnedUserState;
            }
          }
        ),
      };

      return parsedBattle;
    }),
});
