import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

import { type BattleWithUsers } from "../../../libs/combat/types";

export const combatRouter = createTRPCRouter({
  // Get battle and any users in the battle
  getBattle: protectedProcedure
    .input(z.object({ battleId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const battle: BattleWithUsers[] = await ctx.prisma
        .$queryRaw`SELECT * FROM Battle INNER JOIN UserData ON UserData.battleId = ${input.battleId}`;
      return battle;
    }),
});
