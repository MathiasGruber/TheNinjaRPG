import React from "react";
import Loader from "./Loader";
import { api } from "../utils/api";
import { groupBy } from "../utils/grouping";
import type { ActionEffect } from "../libs/combat/types";
import type { ReturnedBattle } from "../libs/combat/types";

interface CombatHistoryProps {
  battle: ReturnedBattle;
}

const CombatHistory: React.FC<CombatHistoryProps> = (props) => {
  // State
  const { battle } = props;

  // From database
  const { data: allEntries, isFetching } = api.combat.getBattleEntries.useQuery(
    { battleId: battle.id },
    {
      enabled: battle.id !== undefined,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const groups = allEntries && groupBy(allEntries, "battleRound");

  // Create the history
  const history: React.ReactNode[] = [];
  groups?.forEach((entries, round) => {
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
    <div className="relative flex flex-col border-b-2 border-l-2 border-r-2 bg-slate-100 max-h-48 overflow-auto">
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
