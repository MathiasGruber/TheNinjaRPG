import { useEffect, useState } from "react";

/**
 * useLiveCountdown
 * - Takes an initial remaining seconds value (typically from a server response)
 * - Returns a live countdown that decrements every second
 * - Resyncs when the rounded serverSeconds value changes, including starts and stops
 *
 * @param serverSeconds - The remaining seconds from the server (undefined/null treated as 0)
 * @returns The current live countdown in seconds
 */
export const useLiveCountdown = (serverSeconds: number | undefined | null): number => {
  // Round to whole seconds for stable comparison
  const roundedServerSeconds = Math.max(0, Math.round(serverSeconds ?? 0));

  const [liveSeconds, setLiveSeconds] = useState<number>(roundedServerSeconds);

  // Whole-second inputs keep render-derived remainders stable across the state update.
  useEffect(() => {
    setLiveSeconds(roundedServerSeconds);
    if (roundedServerSeconds <= 0) return;

    // Read the wall clock so delayed callbacks still account for time spent in the background.
    const targetTime = Date.now() + roundedServerSeconds * 1000;
    const interval = setInterval(() => {
      const remainingSeconds = Math.max(0, (targetTime - Date.now()) / 1000);
      setLiveSeconds(remainingSeconds);
      if (remainingSeconds === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [roundedServerSeconds]);

  return liveSeconds;
};
