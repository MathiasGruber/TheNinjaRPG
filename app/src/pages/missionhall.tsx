import { type NextPage } from "next";
import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Countdown from "@/layout/Countdown";
import { LogbookEntry } from "@/layout/Logbook";
import Image from "next/image";
import Confirm from "@/layout/Confirm";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { availableRanks } from "@/libs/train";
import { secondsFromDate } from "@/utils/time";
import { missionHallSettings } from "@/libs/quest";
import { useRequiredUserData } from "@/utils/UserContext";
import { useRequireInVillage } from "@/utils/village";

const MissionHall: NextPage = () => {
  const [, setCounter] = useState(0); // NOTE: This is a hack to force re-render
  const { data: userData, refetch, timeDiff } = useRequiredUserData();
  useRequireInVillage();

  const currentQuest = userData?.userQuests?.find(
    (q) => ["mission", "crime", "errand"].includes(q.quest.questType) && !q.endAt,
  );
  const currentTracker = userData?.questData?.find(
    (q) => q.id === currentQuest?.questId,
  );

  const { data: hallData } = api.quests.missionHall.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { mutate: startRandom, isLoading } = api.quests.startRandom.useMutation({
    onSuccess: () => {
      void refetch();
    },
    onError: (error) => {
      show_toast("Error getting quest", error.message, "error");
    },
  });

  if (!userData) return <Loader explanation="Loading userdata" />;

  // Current timestamp synced with server
  const now = new Date(new Date().getTime() - timeDiff);

  // Get available letter ranks for user
  const availableUserRanks = availableRanks(userData.rank);

  return (
    <ContentBox
      title="Mission Hall"
      subtitle="Complete missions for great rewards"
      back_href="/village"
      padding={false}
    >
      <Image
        alt="welcome"
        src="/missionhall.webp"
        width={512}
        height={195}
        className="w-full"
        priority={true}
      />
      {isLoading && <Loader explanation="Accepting..." />}
      {currentQuest && currentTracker && (
        <div className="p-3">
          <LogbookEntry userQuest={currentQuest} tracker={currentTracker} />
        </div>
      )}
      {!currentQuest && !isLoading && (
        <div className="grid grid-cols-3 italic p-3 gap-4 text-center">
          {missionHallSettings.map((setting, i) => {
            // Count how many of this type and rank are available
            const count =
              hallData?.find(
                (point) => point.type === setting.type && point.rank === setting.rank,
              )?.count ?? 0;
            // Based on last quest finish, create countdown if applicable
            const allowedAt = secondsFromDate(
              setting.delayMinutes * 60,
              userData.questFinishAt,
            );
            const coundownComponent = (
              <Countdown
                targetDate={allowedAt}
                onFinish={() => setCounter((n) => n + 1)}
              />
            );
            const timer = allowedAt > now ? coundownComponent : null;
            // Check is user rank is high enough for this quest
            const isRankAllowed = availableUserRanks.includes(setting.rank);
            return (
              <Confirm
                key={i}
                title="Confirm Activity"
                proceed_label="Accept"
                button={
                  <div
                    className={
                      count === 0 || timer !== null || !isRankAllowed
                        ? "filter grayscale"
                        : "hover:cursor-pointer hover:opacity-30"
                    }
                  >
                    <Image alt="small" src={setting.image} width={256} height={256} />
                    <p className="font-bold">{setting.name}</p>
                    <p>{timer ?? <>[{count} available]</>}</p>
                  </div>
                }
                onAccept={(e) => {
                  e.preventDefault();
                  startRandom({ type: setting.type, rank: setting.rank });
                }}
              >
                {isLoading && <Loader explanation="Accepting..." />}
                {!isLoading && (
                  <div className="flex flex-row items-center gap-4">
                    <div>{setting.description}</div>
                    <Image alt="small" src={setting.image} width={128} height={128} />
                  </div>
                )}
              </Confirm>
            );
          })}
        </div>
      )}
    </ContentBox>
  );
};

export default MissionHall;
