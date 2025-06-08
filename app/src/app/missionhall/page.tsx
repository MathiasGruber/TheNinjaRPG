"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import { LogbookEntry } from "@/layout/Logbook";
import Image from "next/image";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/app/_trpc/client";
import { availableQuestLetterRanks } from "@/libs/train";
import { getMissionHallSettings } from "@/libs/quest";
import { useRequireInVillage } from "@/utils/UserContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MISSIONS_PER_DAY,
  ERRANDS_PER_DAY,
  IMG_BUILDING_MISSIONHALL,
} from "@/drizzle/constants";
import { VILLAGE_SYNDICATE_ID } from "@/drizzle/constants";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function MissionHall() {
  const util = api.useUtils();
  const { userData, access } = useRequireInVillage("/missionhall");

  const currentQuest = userData?.userQuests?.find(
    (q) => ["mission", "crime", "errand"].includes(q.quest.questType) && !q.endAt,
  );
  const currentTracker = userData?.questData?.find(
    (q) => q.id === currentQuest?.questId,
  );

  const { data: hallData } = api.quests.missionHall.useQuery(
    {
      villageId: userData?.isOutlaw
        ? VILLAGE_SYNDICATE_ID
        : (userData?.villageId ?? VILLAGE_SYNDICATE_ID),
      level: userData?.level ?? 0,
    },
    { enabled: !!userData },
  );

  const { mutate: startRandom, isPending } = api.quests.startRandom.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await util.profile.getUser.invalidate();
    },
  });

  const { mutate: startQuest } = api.quests.startQuest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await util.profile.getUser.invalidate();
    },
  });

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Hall" />;
  if (userData.isBanned) return <BanInfo />;

  // Derived
  const availableUserRanks = availableQuestLetterRanks(userData.rank);
  const errandsLeft = ERRANDS_PER_DAY - userData.dailyErrands;
  const classifier = userData.isOutlaw ? "crime" : "mission";
  const aRanks = hallData?.filter(
    (m) => m.questType === classifier && m.questRank === "A",
  );

  return (
    <ContentBox
      title={userData.isOutlaw ? "Crimes Board" : "Mission Hall"}
      subtitle={
        userData.isOutlaw ? "Small and big assignments" : "Help the village grow"
      }
      back_href="/village"
      padding={false}
    >
      <Image
        alt="welcome"
        src={IMG_BUILDING_MISSIONHALL}
        width={512}
        height={195}
        className="w-full"
        priority={true}
      />
      <p className="text-center text-xl font-bold mb-4 p-3">
        Missions are special assignments that advance the game&apos;s narrative. They
        can only be started here at the Mission Hall.
      </p>
      <p className="text-center p-3 text-xl font-bold">
        Errands [{userData.dailyErrands} / {ERRANDS_PER_DAY}] -{" "}
        {capitalizeFirstLetter(classifier)}s [{userData.dailyMissions} /{" "}
        {MISSIONS_PER_DAY}]
      </p>
      {isPending && <Loader explanation="Accepting..." />}
      {currentQuest && currentTracker && (
        <div className="p-3">
          <LogbookEntry userQuest={currentQuest} tracker={currentTracker} />
        </div>
      )}
      {!currentQuest && !isPending && (
        <div className="grid grid-cols-3 italic p-3 gap-4 text-center">
          {getMissionHallSettings(userData.isOutlaw).map((setting, i) => {
            // Count how many of this type and rank are available
            const count =
              hallData?.filter(
                (point) =>
                  point.questType === setting.type && point.questRank === setting.rank,
              )?.length ?? 0;
            // Check is user rank is high enough for this quest
            const isErrand = setting.type === "errand";
            const isRankAllowed = availableUserRanks.includes(setting.rank) || isErrand;
            // Completed field on user model
            const capped = isErrand ? errandsLeft <= 0 : false;
            if (setting.rank === "A") {
              return (
                <Popover key={`mission-${i}`}>
                  <PopoverTrigger asChild>
                    <div
                      key={i}
                      className={
                        count === 0 || capped || !isRankAllowed
                          ? "filter grayscale"
                          : "hover:cursor-pointer hover:opacity-30"
                      }
                    >
                      <Image alt="small" src={setting.image} width={256} height={256} />
                      <p className="font-bold">{setting.name}</p>
                      <p>[Select out of {count} available]</p>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent>
                    <div className="grid grid-cols-3 gap-2">
                      {aRanks?.map((mission, i) => (
                        <AlertDialog key={`specific-mission-${i}`}>
                          <AlertDialogTrigger asChild>
                            <div className="hover:opacity-70 hover:cursor-pointer">
                              <div className="flex flex-col justify-center items-center">
                                <Image
                                  alt="small"
                                  className="rounded-lg"
                                  src={mission.image || setting.image}
                                  width={128}
                                  height={128}
                                />
                                <p className="font-bold text-xs text-center">
                                  {mission.name}
                                </p>
                                {userData.dailyMissions >= 9 && userData.dailyMissions < 20 && (
                                  <p className="text-sm text-yellow-500">40% Rewards</p>
                                )}
                                {userData.dailyMissions >= 20 && (
                                  <p className="text-sm text-red-500">Daily Limit Reached</p>
                                )}
                              </div>
                            </div>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Accept Mission: {mission.name}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {userData.dailyMissions >= 20 ? (
                                  "You have reached your daily mission limit of 20 missions. Please try again tomorrow."
                                ) : (
                                  <>
                                    Are you sure you want to accept the mission &quot;
                                    {mission.name}&quot;? You can only have one active
                                    mission at a time.
                                    {userData.dailyMissions >= 9 && (
                                      <>
                                        <br />
                                        <br />
                                        <span className="text-yellow-500">
                                          Note: You have completed more than 9 missions
                                          today. This mission will only give 40% of its
                                          normal rewards.
                                        </span>
                                      </>
                                    )}
                                  </>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              {userData.dailyMissions >= 20 ? (
                                <AlertDialogAction disabled>Daily Limit Reached</AlertDialogAction>
                              ) : (
                                <AlertDialogAction
                                  onClick={() =>
                                    startQuest({
                                      questId: mission.id,
                                      userSector: userData.sector,
                                    })
                                  }
                                >
                                  Accept Mission
                                </AlertDialogAction>
                              )}
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            } else {
              return (
                <AlertDialog key={i}>
                  <AlertDialogTrigger asChild>
                    <div
                      className={
                        count === 0 || !isRankAllowed || (!isErrand && userData.dailyMissions >= 20)
                          ? "filter grayscale"
                          : "hover:cursor-pointer hover:opacity-30"
                      }
                    >
                      <Image alt="small" src={setting.image} width={256} height={256} />
                      <p className="font-bold">{setting.name}</p>
                      <p>[Random out of {count} available]</p>
                      {!isErrand && userData.dailyMissions >= 9 && userData.dailyMissions < 20 && (
                        <p className="text-sm text-yellow-500">40% Rewards</p>
                      )}
                      {!isErrand && userData.dailyMissions >= 20 && (
                        <p className="text-sm text-red-500">Daily Limit Reached</p>
                      )}
                    </div>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Accept Random Mission</AlertDialogTitle>
                      <AlertDialogDescription>
                        {!isErrand && userData.dailyMissions >= 20 ? (
                          "You have reached your daily mission limit of 20 missions. Please try again tomorrow."
                        ) : (
                          <>
                            Are you sure you want to accept a random {setting.rank}-rank{" "}
                            {setting.type}? You can only have one active mission at a time.
                            {!isErrand && userData.dailyMissions >= 9 && (
                              <>
                                <br />
                                <br />
                                <span className="text-yellow-500">
                                  Note: You have already completed 9 missions today. This
                                  mission will only give 40% of its normal rewards.
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      {!isErrand && userData.dailyMissions >= 20 ? (
                        <AlertDialogAction disabled>Daily Limit Reached</AlertDialogAction>
                      ) : (
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault();
                            startRandom({
                              type: setting.type,
                              rank: setting.rank,
                              userLevel: userData.level,
                              userSector: userData.sector,
                              userVillageId: userData.villageId,
                            });
                          }}
                        >
                          Accept Mission
                        </AlertDialogAction>
                      )}
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            }
          })}
        </div>
      )}
    </ContentBox>
  );
}
