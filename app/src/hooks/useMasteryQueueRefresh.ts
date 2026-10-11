import { useMemo } from "react";
import { useRefreshAt } from "@/hooks/useRefreshAt";
import { masteryTrainingEndsAt } from "@/libs/train";
import type { UserWithRelations } from "@/routers/profile";

/** Finish mastery sessions on every page, including the final session and while asleep. */
export const useMasteryQueueRefresh = (
  user: UserWithRelations,
  onRefresh: () => void,
  timeDiff: number,
  enabled = true,
) => {
  const finishesAt = user ? masteryTrainingEndsAt(user)?.getTime() : null;
  // Preserve the pending refresh through unrelated profile renders, including
  // useRefreshAt's grace period just after the server deadline.
  const deadlines = useMemo(() => [finishesAt], [finishesAt]);
  useRefreshAt(
    deadlines,
    onRefresh,
    timeDiff,
    enabled && !!user && ["AWAKE", "ASLEEP"].includes(user.status),
  );
};
