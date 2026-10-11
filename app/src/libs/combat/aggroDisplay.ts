import { stillInBattle } from "./actions";
import type { ReturnedUserState, UserEffect } from "./types";

/** Compare active, visible combatants within their own side, including summons. */
export const getAggroDisplay = (users: ReturnedUserState[], effects?: UserEffect[]) => {
  const active = users.filter(
    (user) => !user.hidden && !user.leftBattle && stillInBattle(user, effects),
  );
  const highest = { left: 0, right: 0 };
  for (const user of active) {
    highest[user.direction] = Math.max(highest[user.direction], user.enmity ?? 0);
  }
  return new Map(
    active.map((user) => {
      const enmity = user.enmity ?? 0;
      const maximum = highest[user.direction];
      return [
        user.userId,
        {
          enmity,
          ratio: maximum > 0 ? enmity / maximum : 0,
          isHighest: maximum > 0 && enmity === maximum,
        },
      ];
    }),
  );
};

export type AggroDisplay = ReturnType<typeof getAggroDisplay>;
