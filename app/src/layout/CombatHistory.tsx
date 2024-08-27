import React from "react";
import Loader from "./Loader";
import { api } from "@/utils/api";
import { groupBy } from "@/utils/grouping";
import { insertComponentsIntoText } from "@/utils/string";
import type { CombatResult } from "@/libs/combat/types";
import type { ActionEffect } from "@/libs/combat/types";

interface CombatHistoryProps {
  battleId: string;
  asc?: boolean;
  battleVersion?: number;
  battleRound?: number;
  results?: CombatResult | null;
}

const CombatHistory: React.FC<CombatHistoryProps> = (props) => {
  // State
  const { battleId, battleVersion, battleRound, results, asc } = props;

  // From database
  const { data: allEntries, isFetching } = api.combat.getBattleEntries.useQuery(
    {
      battleId: battleId,
      refreshKey: battleVersion ?? 0,
      checkBattle: results ? true : false,
    },
    {
      enabled: battleId !== undefined,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const groups = allEntries && groupBy(allEntries, "battleRound");

  // Fill in missing entries
  let maxRound = 0;
  if (allEntries) maxRound = Math.max(...allEntries.map((e) => e.battleRound));
  if (battleRound) maxRound = battleRound;

  for (let i = 1; i < maxRound; i++) {
    if (!groups?.has(i)) {
      groups?.set(i, [
        {
          id: "0",
          description: "No information on what happened during this round.",
          createdAt: new Date(),
          updatedAt: new Date(),
          battleId: battleId,
          battleVersion: 0,
          battleRound: i,
          appliedEffects: [],
        },
      ]);
    }
  }

  // Get keys of the groups map, and reverse sort them
  const sortedGroups =
    groups &&
    new Map([...groups.entries()].sort((a, b) => (asc ? a[0] - b[0] : b[0] - a[0])));

  // Create the history
  const history: React.ReactNode[] = [];
  sortedGroups?.forEach((entries, round) => {
    history.push(
      <li key={`r-${round}`} className=" ml-4">
        <div className="absolute w-3 h-3 rounded-full mt-1.5 -left-1.5 border border-gray-900 bg-gray-700"></div>
        <time className="mb-1 text-sm font-normal leading-none text-gray-900">
          Round {round}
        </time>
        {entries
          .sort((a, b) => b.battleVersion - a.battleVersion)
          .map((entry) => {
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
                  const text = insertComponentsIntoText(effect.txt, {
                    Highest: <span className="text-stone-500">Highest</span>,
                    Taijutsu: <span className="text-green-600">Taijutsu</span>,
                    Bukijutsu: <span className="text-red-600">Bukijutsu</span>,
                    Ninjutsu: <span className="text-blue-600">Ninjutsu</span>,
                    Genjutsu: <span className="text-purple-600">Genjutsu</span>,
                    Strength: <span className="text-blue-800">Strength</span>,
                    Intelligence: <span className="text-teal-600">Intelligence</span>,
                    Willpower: <span className="text-orange-600">Willpower</span>,
                    Speed: <span className="text-cyan-600">Speed</span>,
                  });
                  return (
                    <p key={`combathistory-${i}`} className={color}>
                      - {text}
                    </p>
                  );
                })}
              </div>
            );
          })}
      </li>,
    );
  });

  // Show component
  return (
    <div className="relative flex flex-col border-b-2 border-l-2 pl-2 border-r-2 bg-slate-100 max-h-80 overflow-auto">
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
