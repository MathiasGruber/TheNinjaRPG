"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { ContentBox } from "@/components/layout/ContentBox";
import { Loader } from "@/components/layout/Loader";
import { BanInfo } from "@/components/layout/BanInfo";
import { useRequireInVillage } from "@/hooks/useRequireInVillage";
import { showMutationToast } from "@/utils/toast";
import { QueueTimer } from "@/components/layout/QueueTimer";

export default function Ranked() {
  // Router for forwarding
  const router = useRouter();

  // Ensure user is in village
  const { userData, access } = useRequireInVillage("/ranked");

  // Ranked PvP queue state and mutations
  const { data: queueData } = api.combat.getRankedPvpQueue.useQuery(undefined, {
    enabled: !!userData,
    refetchInterval: 5000, // Refetch queue status every 5 seconds
  });

  const { mutate: queue, isPending: isQueuing } = api.combat.queueForRankedPvp.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        showMutationToast({ ...result, message: "Queued for ranked PvP" });
        if (result.battleId) {
          router.push("/combat");
        }
      } else {
        showMutationToast(result);
      }
    },
  });

  const { mutate: leaveQueue, isPending: isLeaving } = api.combat.leaveRankedPvpQueue.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        showMutationToast({ ...result, message: "Left ranked PvP queue" });
      } else {
        showMutationToast(result);
      }
    },
  });

  const { mutate: checkMatches } = api.combat.checkRankedPvpMatches.useMutation({
    onSuccess: (result) => {
      if (result.success && result.battleId) {
        router.push("/combat");
      }
    },
  });

  // Check for matches periodically when in queue
  useEffect(() => {
    if (queueData?.inQueue) {
      const interval = setInterval(() => {
        checkMatches();
      }, 5000); // Check for matches every 5 seconds
      return () => clearInterval(interval);
    }
  }, [queueData?.inQueue, checkMatches]);

  // Guards
  if (!access) return <Loader explanation="Accessing Ranked PvP" />;
  if (!userData) return <Loader explanation="Loading user" />;
  if (userData?.isBanned) return <BanInfo />;

  return (
    <ContentBox
      title="Ranked PvP"
      subtitle={`Current LP: ${userData?.rankedLp}`}
      back_href="/village"
      padding={false}
    >
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Queue for ranked PvP battles! You will be matched with players of similar LP.
          All battles are fought with level 100 characters with max stats.
        </p>
        <p className="text-sm text-muted-foreground">
          Players in queue: {queueData?.queueCount ?? 0}
        </p>
        {queueData?.inQueue && (
          <p className="text-yellow-500">
            You are currently in queue. Waiting for opponent... 
            {queueData.createdAt && (
              <span className="ml-2">
                Time in queue: <QueueTimer createdAt={queueData.createdAt} />
              </span>
            )}
          </p>
        )}
        {!queueData?.inQueue ? (
          <Button
            className="w-full"
            onClick={() => {
              if (userData.status === "BATTLE") {
                showMutationToast({ 
                  success: false, 
                  message: "You cannot queue while in battle. Please finish your current battle first."
                });
                return;
              }
              queue();
            }}
            disabled={isQueuing}
          >
            {isQueuing ? "Queuing..." : "Queue for Ranked PvP"}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => leaveQueue()}
            disabled={isLeaving}
          >
            {isLeaving ? "Leaving..." : "Leave Queue"}
          </Button>
        )}
      </div>
    </ContentBox>
  );
} 
