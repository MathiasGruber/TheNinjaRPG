"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import { useRequireInVillage } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Modal from "@/layout/Modal";
import { OctagonX } from "lucide-react";
import { ActionSelector } from "@/layout/CombatActions";
import JutsuFiltering, { useFiltering, getFilter } from "@/layout/JutsuFiltering";
import LoadoutSelector from "@/layout/LoadoutSelector";
import type { Jutsu, UserJutsu } from "@/drizzle/schema";

const QueueTimer = ({ createdAt }: { createdAt: Date }) => {
  const [queueTime, setQueueTime] = useState("0:00");

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const diff = now.getTime() - new Date(createdAt).getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setQueueTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000);
  
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span className="font-mono">{queueTime}</span>
  );
};

export default function Ranked() {
  // Router for forwarding
  const router = useRouter();
  const utils = api.useUtils();

  // Ensure user is in village
  const { userData, access } = useRequireInVillage("/battlearena");

  // Two-level filtering for jutsu
  const state = useFiltering();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [jutsu, setJutsu] = useState<(Jutsu & { highlight: boolean }) | undefined>(undefined);

  // Ranked PvP queue state and mutations
  const { data: queueData } = api.combat.getRankedPvpQueue.useQuery(undefined, {
    enabled: !!userData,
    refetchInterval: 5000, // Refetch queue status every 5 seconds
  });

  // Get all jutsu and user jutsu data
  const { data: allJutsu, isFetching: isLoadingJutsu } = api.jutsu.getAll.useInfiniteQuery(
    { limit: 100, hideAi: true, ...getFilter(state) },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      enabled: !!userData,
    }
  );

  const { data: userJutsus, isFetching: isLoadingUserJutsu } = api.jutsu.getUserJutsus.useQuery(
    getFilter(state),
    { enabled: !!userData }
  );

  // Mutations for queue management
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

  // Mutations for jutsu management
  const { mutate: equip, isPending: isToggling } = api.jutsu.toggleRankedEquip.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      await utils.jutsu.getUserJutsus.invalidate();
    },
    onSettled: () => {
      setIsOpen(false);
      setJutsu(undefined);
    },
  });

  const { mutate: unequipAll, isPending: isUnequipping } = api.jutsu.unequipAllRanked.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      await utils.jutsu.getUserJutsus.invalidate();
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

  // Process jutsu data
  const flatJutsu = allJutsu?.pages.map((page) => page.data).flat() || [];
  const userJutsuMap = new Map(userJutsus?.map(userJutsu => [userJutsu.jutsuId, userJutsu]));
  const processedJutsu = flatJutsu.map(jutsu => ({
    ...jutsu,
    highlight: userJutsuMap.get(jutsu.id)?.rankedEquipped || false,
  }));

  return (
    <>
      <ContentBox
        title="Ranked PvP"
        subtitle={`Current LP: ${userData?.rankedLp || 0}`}
        back_href="/village"
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

      <ContentBox title="Ranked Jutsu" subtitle="Select jutsu for ranked battles">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <JutsuFiltering state={state} />
            <Button
              variant="destructive"
              onClick={() => unequipAll()}
              disabled={isUnequipping}
            >
              Unequip All
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {processedJutsu.map((jutsu) => (
              <ItemWithEffects
                key={jutsu.id}
                item={jutsu}
                onClick={() => {
                  setJutsu(jutsu);
                  setIsOpen(true);
                }}
              />
            ))}
          </div>

          {isLoadingJutsu && <Loader explanation="Loading jutsu" />}
        </div>
      </ContentBox>

      {jutsu && (
        <Modal
          title={jutsu.name}
          isOpen={isOpen}
          onClose={() => {
            setIsOpen(false);
            setJutsu(undefined);
          }}
        >
          <div className="flex flex-col gap-4">
            <ItemWithEffects item={jutsu} />
            <div className="flex justify-between">
              <Button
                variant={jutsu.highlight ? "destructive" : "default"}
                onClick={() => equip({ jutsuId: jutsu.id })}
                disabled={isToggling}
              >
                {jutsu.highlight ? "Unequip" : "Equip"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsOpen(false);
                  setJutsu(undefined);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
} 
