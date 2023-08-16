import React, { useState, useEffect } from "react";
import Loader from "./Loader";
import { api } from "../utils/api";
import { getBattleRound } from "../libs/combat/actions";
import { groupBy } from "../utils/grouping";
import { useInfinitePagination } from "../libs/pagination";
import type { ActionEffect } from "../libs/combat/types";
import type { ReturnedBattle } from "../libs/combat/types";

interface CombatHistoryProps {
  battle: ReturnedBattle;
}

const CombatHistory: React.FC<CombatHistoryProps> = (props) => {
  // State
  const { battle } = props;
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [version, setVersion] = useState<number>(battle.version);

  // From database
  const { data, fetchNextPage, hasNextPage, isFetching } =
    api.combat.getBattleEntries.useInfiniteQuery(
      { battleId: battle.id, limit: 10, refreshKey: version },
      {
        enabled: battle.id !== undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        keepPreviousData: true,
        staleTime: Infinity,
      }
    );
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  const allEntries = data?.pages.map((page) => page.data).flat();
  const groups = allEntries && groupBy(allEntries, "battleRound");

  // const { data, isFetching: isFetchingHistory } = api.combat.getBattleEntry.useQuery(
  //   { battleId: battleId, version: version },
  //   { staleTime: Infinity, keepPreviousData: true }
  // );
  // const effects = allEntries && (allEntries.appliedEffects as ActionEffect[]);

  // Create an array from zero to maxVersion
  // const versionArray = Array.from(Array(battleVersion).keys());
  // let lastHidden = false;

  // Update version whenever battleVersion changes
  useEffect(() => {
    setVersion(battle.version);
  }, [battle.version]);

  // Create the history
  const history: React.ReactNode[] = [];
  const lastVersion = allEntries && allEntries.at(-1)?.battleVersion;
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
              ref={entry.battleVersion === lastVersion ? setLastElement : null}
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

      {/* <div className="px-2 pt-2">
        {data && (
          <>
            <i>{data.description}</i>
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
          </>
        )}
        {!data && <i>No action to be fetched</i>}
      </div>
      <div className="py-2">
        <ul className="inline-flex">
          {versionArray.map((i) => {
            const v = i + 1;
            const isFirst = v === 1;
            const isLast = v === battleVersion;
            const nearSelect = Math.abs(version - v) <= 2;
            const nearEdge = Math.min(Math.abs(v - battleVersion), v) <= 1;
            const isHidden = !isFirst && !isLast && !nearSelect && !nearEdge;
            const showDots = isHidden && !lastHidden;
            const style = `${v === 1 ? "rounded-l-lg" : ""} ${
              isLast ? "rounded-r-lg" : ""
            } ${
              v === version
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                : "bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            } border border-gray-300 px-1 sm:px-2 py-2 `;
            lastHidden = isHidden;
            return (
              <li key={i}>
                {!isHidden && (
                  <div className={style} onClick={() => setVersion(v)}>
                    {isLast ? `Last` : v}
                  </div>
                )}
                {isHidden && showDots && <div className={style}>...</div>}
              </li>
            );
          })}
        </ul>
      </div>
     */}
    </div>
  );
};

export default CombatHistory;
