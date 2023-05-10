import React, { useState, useEffect } from "react";
import Loader from "./Loader";
import { api } from "../utils/api";
import type { ActionEffect } from "../libs/combat/types";

interface CombatHistoryProps {
  battleId: string;
  battleVersion: number;
}

const CombatHistory: React.FC<CombatHistoryProps> = (props) => {
  // Destructure
  const { battleId, battleVersion } = props;

  // State
  const [version, setVersion] = useState<number>(battleVersion);

  // From database
  const { data, isFetching: isFetchingHistory } = api.combat.getBattleEntry.useQuery(
    { battleId: battleId, version: version },
    { staleTime: Infinity }
  );
  const effects = data?.appliedEffects as ActionEffect[];

  // Create an array from zero to maxVersion
  const versionArray = Array.from(Array(battleVersion).keys());
  let lastHidden = false;

  // Update version whenever battleVersion changes
  useEffect(() => {
    setVersion(battleVersion);
  }, [battleVersion]);

  console.log(battleVersion);

  // Show component
  return (
    <div className="flex flex-col items-center justify-center border-b-2 border-l-2 border-r-2 bg-slate-100">
      {isFetchingHistory && (
        <div className="absolute">
          <Loader />
        </div>
      )}
      <div className="px-2 pt-2">
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
    </div>
  );
};

export default CombatHistory;
