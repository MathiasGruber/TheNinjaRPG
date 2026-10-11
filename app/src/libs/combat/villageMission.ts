import type { VillageMissionTask } from "@/drizzle/constants";
import type { CombatResult, CompleteBattle } from "@/libs/combat/types";
import { wasDefeated } from "@/libs/combat/util";

/** PvP kills use the participants and effects preloaded into battle state. */
export const getVillageMissionCombatEvents = (
  battle: CompleteBattle,
  userId: string,
  result: CombatResult,
): Partial<Record<VillageMissionTask, number>> => {
  const user = battle.usersState.find((entry) => entry.userId === userId);
  if (
    !user ||
    user.isAi ||
    !user.villageId ||
    !result.didWin ||
    battle.battleType !== "COMBAT"
  )
    return {};
  const kills = battle.usersState.filter(
    (entry) =>
      entry.direction !== user.direction &&
      !entry.isAi &&
      !entry.isSummon &&
      wasDefeated(entry, battle.usersEffects),
  ).length;
  return kills > 0 ? { pvp_kills: kills } : {};
};
