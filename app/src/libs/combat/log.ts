import type { SuperJSONResult } from "superjson";
import type { RouterInputs } from "@/app/_trpc/client";
import type { BattleAction } from "@/drizzle/schema";

/** Committed log rows only; null requests recovery when a delta exceeds the event limit. */
export type BattleUpdate = {
  version: number;
  logEntries?: SuperJSONResult | null;
  finished?: boolean;
};

/** Reuse a provably complete page, including overlapping or reordered action deltas. */
export const mergeBattleEntries = (
  previous: BattleAction[] | undefined,
  incoming: BattleAction[],
  input: RouterInputs["combat"]["getBattleEntries"],
  nextVersion: number,
): BattleAction[] | undefined => {
  const version = input.refreshKey;
  const limit = input.limit ?? 30;
  const targetVersion = Math.max(version ?? 0, nextVersion);
  if (
    !previous ||
    version === undefined ||
    version < 1 ||
    (input.userFilter !== undefined && input.userFilter !== "all") ||
    input.showBasicActions === false ||
    input.offset ||
    !incoming.length ||
    incoming.some((entry) => entry.battleId !== input.battleId) ||
    previous.some((entry) => entry.battleId !== input.battleId)
  )
    return undefined;

  // The DB's unique key includes round: duplicate delivery must not duplicate rows.
  const entries = [
    ...new Map(
      [...previous, ...incoming].map((entry) => [
        `${entry.battleVersion}:${entry.battleRound}`,
        entry,
      ]),
    ).values(),
  ]
    .sort((a, b) => b.battleRound - a.battleRound || b.battleVersion - a.battleVersion)
    .slice(0, limit);
  // A claimed version alone cannot prove its log insert finished. Only a full,
  // contiguous page is safe to reuse; filtered pages and genuine gaps still read.
  if (
    entries.length !== Math.min(targetVersion - 1, limit) ||
    entries.some((entry, i) => entry.battleVersion !== targetVersion - 1 - i)
  )
    return undefined;
  return entries;
};
