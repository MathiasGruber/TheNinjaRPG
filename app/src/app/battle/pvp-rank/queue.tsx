"use client";

import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";

export function PvpRankQueue() {
  const router = useRouter();
  const [searchTime, setSearchTime] = useState(0);
  const [matchFound, setMatchFound] = useState(false);

  const { mutate: leaveQueue } = api.pvpRank.leaveQueue.useMutation({
    onSuccess: () => {
      router.refresh();
    },
  });

  const { mutate: findMatch } = api.pvpRank.findMatch.useMutation({
    onSuccess: (data) => {
      if (data.opponent) {
        setMatchFound(true);
        // TODO: Redirect to battle page with opponent data
      }
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSearchTime((prev) => prev + 1);

      // Try to find match every 30 seconds
      if (searchTime > 0 && searchTime % 30 === 0) {
        findMatch();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [searchTime, findMatch]);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-4">
        {matchFound ? "Match Found!" : "Searching for Opponent..."}
      </h2>

      {!matchFound && (
        <>
          <div className="mb-4">
            Time in queue: {Math.floor(searchTime / 60)}:{String(searchTime % 60).padStart(2, "0")}
          </div>

          <div className="mb-4">
            Looking for players within{" "}
            {searchTime >= 240
              ? Math.min(300, 100 + Math.floor((searchTime - 240) / 30) * 50)
              : 100}{" "}
            LP range
          </div>

          <button
            onClick={() => leaveQueue()}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Leave Queue
          </button>
        </>
      )}
    </div>
  );
}
