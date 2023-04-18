import { z } from "zod";
import type {
  UserData,
  UserJutsu,
  Jutsu,
  UserItem,
  Item,
  Bloodline,
} from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { publicState, allState } from "../../../libs/combat/types";

type User = Pick<UserData, (typeof publicState)[number]> &
  Partial<UserData> & {
    jutsus: (UserJutsu & {
      jutsu: Jutsu;
    })[];
    items: (UserItem & {
      item: Item;
    })[];
    bloodline?: Bloodline;
  };

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
        usersState: (battle.usersState as unknown as User[]).map((user) => {
          if (user.userId !== ctx.userId) {
            return Object.fromEntries(
              publicState.map((key) => [key, user[key]])
            ) as unknown as User;
          } else {
            return Object.fromEntries(
              allState.map((key) => [key, user[key]])
            ) as unknown as User;
          }
        }),
      };

      return parsedBattle;
    }),
});
