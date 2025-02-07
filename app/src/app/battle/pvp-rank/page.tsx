import { api } from "~/trpc/server";
import { PvpRankQueue } from "./queue";
import { PvpRankLoadout } from "./loadout";

export default async function PvpRankPage() {
  const rankInfo = await api.pvpRank.getRankInfo.query();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">PVP Rank Arena</h1>

      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h2 className="text-xl font-semibold mb-2">Your Rank</h2>
        <div className="flex items-center gap-4">
          <div className="text-lg">
            Rank: <span className="font-bold">{rankInfo.rank}</span>
          </div>
          <div className="text-lg">
            LP: <span className="font-bold">{rankInfo.lp}</span>
          </div>
          <div className="text-lg">
            Win Streak: <span className="font-bold">{rankInfo.winStreak}</span>
          </div>
        </div>
      </div>

      {rankInfo.isQueued ? (
        <PvpRankQueue />
      ) : (
        <PvpRankLoadout />
      )}
    </div>
  );
}
