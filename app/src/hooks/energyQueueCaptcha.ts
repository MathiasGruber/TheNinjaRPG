"use client";

import { useEffect, useState } from "react";
import type { EnergyQueueCaptchaVerification } from "@/validators/train";

/** Memory only: navigating away, signing out or changing accounts discards the pass. */
export const useEnergyQueueCaptcha = (
  userId: string,
  sessionId: string | undefined,
  timeDiff: number,
) => {
  const [saved, setSaved] = useState<{
    userId: string;
    sessionId: string | undefined;
    verification: EnergyQueueCaptchaVerification;
  } | null>(null);
  const verification =
    saved?.userId === userId &&
    saved.sessionId === sessionId &&
    saved.verification.expiresAt > Date.now() - timeDiff
      ? saved.verification
      : null;
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(
      () => setSaved(null),
      Math.max(0, saved.verification.expiresAt - (Date.now() - timeDiff)),
    );
    return () => clearTimeout(timer);
  }, [saved, timeDiff]);
  // Clear ownership as well as masking it: switching back cannot restore an old pass.
  useEffect(() => setSaved(null), [userId, sessionId]);
  return {
    verification,
    getCaptchaToken: () => verification?.token,
    onCaptchaVerification: (next: EnergyQueueCaptchaVerification | null) =>
      setSaved(next ? { userId, sessionId, verification: next } : null),
  };
};
