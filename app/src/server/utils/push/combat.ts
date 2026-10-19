import { AutoBattleTypes, type BattleType } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";
import { deferPushToUsers } from "./defer";
import { combatStarted } from "./messages";

/** Use preloaded participants only, after admission and rollback guards succeed. */
export const notifyBattleDefenders = (
  client: DrizzleClient,
  info: {
    battleId: string;
    battleType: BattleType;
    initiatorIds: string[];
    users: { userId: string; isAi: boolean }[];
  },
) => {
  if (AutoBattleTypes.includes(info.battleType)) return;
  const initiators = new Set(info.initiatorIds);
  const recipients = info.users
    .filter((user) => !user.isAi && !initiators.has(user.userId))
    .map((user) => user.userId);
  deferPushToUsers(client, recipients, combatStarted(info.battleId));
};
