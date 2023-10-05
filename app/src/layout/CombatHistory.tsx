import React from "react";
import Loader from "./Loader";
import { api } from "../utils/api";
import { groupBy } from "../utils/grouping";
import type { CombatResult } from "../libs/combat/types";
import type { ActionEffect } from "../libs/combat/types";
import type { ReturnedBattle } from "../libs/combat/types";

interface CombatHistoryProps {
  battle: ReturnedBattle;
  results: CombatResult | null | undefined;
}

const CombatHistory: React.FC<CombatHistoryProps> = (props) => {
  // State
  const { battle, results } = props;

  // From database
  const { data: allEntries, isFetching } = api.combat.getBattleEntries.useQuery(
    {
      battleId: battle.id,
      refreshKey: battle.version,
      checkBattle: results ? true : false,
    },
    {
      enabled: battle.id !== undefined,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const groups = allEntries && groupBy(allEntries, "battleRound");

  // Fill in missing entries
  for (let i = 1; i < battle.round; i++) {
    if (!groups?.has(i)) {
      groups?.set(i, [
        {
          id: "0",
          description: "No information on what happened during this round.",
          createdAt: new Date(),
          updatedAt: new Date(),
          battleId: battle.id,
          battleVersion: 0,
          battleRound: i,
          appliedEffects: [],
        },
      ]);
    }
  }

  // Get keys of the groups map, and reverse sort them
  const sortedGroups =
    groups && new Map([...groups.entries()].sort((a, b) => b[0] - a[0]));

  // Create the history
  const history: React.ReactNode[] = [];
  sortedGroups?.forEach((entries, round) => {
    history.push(
      <li key={`r-${round}`} className=" ml-4">
        <div className="absolute w-3 h-3 rounded-full mt-1.5 -left-1.5 border border-gray-900 bg-gray-700"></div>
        <time className="mb-1 text-sm font-normal leading-none text-gray-900">
          Round {round}
        </time>
        {entries.map((entry) => {
          const effects = entry.appliedEffects as ActionEffect[];
          return (
            <div
              key={`v-${entry.battleVersion}`}
              className="mb-4 text-base font-normal text-gray-500"
            >
              #{entry.battleVersion}: {entry.description}
              {effects?.map((effect, i) => {
                const color =
                  effect.color === "red"
                    ? "text-red-500"
                    : effect.color === "blue"
                    ? "text-blue-500"
                    : "text-green-500";
                return (
                  <p key={i} className={color}>
                    - {effect.txt}
                  </p>
                );
              })}
            </div>
          );
        })}
      </li>
    );
  });

  // Show component
  return (
    <div className="relative flex flex-col border-b-2 border-l-2 border-r-2 bg-slate-100 max-h-80 overflow-auto">
      {isFetching && (
        <div className="absolute right-2 top-2">
          <Loader />
        </div>
      )}
      <ol className="relative border-l border-gray-700 w-full">{history}</ol>
    </div>
  );
};

export default CombatHistory;
