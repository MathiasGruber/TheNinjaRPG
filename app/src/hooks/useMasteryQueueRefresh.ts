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
  const elementalFinishesAt = user
    ? masteryTrainingEndsAt(user, "ELEMENT")?.getTime()
    : null;
  // Preserve the pending refresh through unrelated profile renders, including
  // useRefreshAt's grace period just after the server deadline.
  const masteryDeadline = user && getMasteryQueue(user).length > 0 ? finishesAt : null;
  const elementalDeadline =
    user && getMasteryQueue(user, "ELEMENT").length > 0 ? elementalFinishesAt : null;
  const deadlines = useMemo(
    () => [masteryDeadline, elementalDeadline],
    [masteryDeadline, elementalDeadline],
  );
  useRefreshAt(
    deadlines,
    onRefresh,
    timeDiff,
    enabled && !!user && ["AWAKE", "ASLEEP"].includes(user.status),
  );
};
