"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import { LogbookEntry } from "@/layout/Logbook";
import Image from "next/image";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/utils/api";
import { availableQuestLetterRanks } from "@/libs/train";
import { getMissionHallSettings } from "@/libs/quest";
import { useRequireInVillage } from "@/utils/UserContext";
import { LetterRank, MISSIONS_PER_DAY, QuestType } from "@/drizzle/constants";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import Confirm from "@/layout/Confirm";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function MissionHall() {
  const util = api.useUtils();
  const [missionId, setMissionId] = useState<string | undefined>();
  const { userData, access } = useRequireInVillage("/missionhall");

  const currentQuest = userData?.userQuests?.find(
    (q) => ["mission", "crime", "errand"].includes(q.quest.questType) && !q.endAt,
  );
  const currentTracker = userData?.questData?.find(
    (q) => q.id === currentQuest?.questId,
  );

  var rankAMissionFilter = {
    questType: "mission" as QuestType,
    rank: "A" as LetterRank,
    village: userData?.villageId ?? undefined,
    limit: 20,
  };

  const { data: rankAMissions } = api.quests.getAll.useQuery(
    { ...rankAMissionFilter },
    { enabled: !!userData, staleTime: Infinity },
  );

  const { data: hallData } = api.quests.missionHall.useQuery(
    { villageId: userData?.villageId ?? "", level: userData?.level ?? 0 },
    { enabled: !!userData, staleTime: Infinity },
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
  const missionsLeft = MISSIONS_PER_DAY - userData.dailyMissions;
  const errandsLeft = MISSIONS_PER_DAY - userData.dailyErrands;
  const classifier = userData.isOutlaw ? "crime" : "mission";

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
        src="/missionhall.webp"
        width={512}
        height={195}
        className="w-full"
        priority={true}
      />
      <p className="text-center p-3 text-xl font-bold">
        Errands [{userData.dailyErrands} / {MISSIONS_PER_DAY}] -{" "}
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
              hallData?.find(
                (point) => point.type === setting.type && point.rank === setting.rank,
              )?.count ?? 0;
            // Check is user rank is high enough for this quest
            const isErrand = setting.type === "errand";
            const isRankAllowed = availableUserRanks.includes(setting.rank) || isErrand;
            // Completed field on user model
            const capped = isErrand ? errandsLeft <= 0 : missionsLeft <= 0;
            if (setting.type === "mission" && setting.rank === "A") {
              return (
                <Confirm
                  title="Choose your quest"
                  button={
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
                      <p>[Random out of {count} available]</p>
                    </div>
                  }
                  onAccept={(e) => {
                    e.preventDefault();
                    startQuest({ questId: missionId ?? "" });
                  }}
                >
                  <div>
                    <p>Please select your quest from the following:</p>
                    {rankAMissions?.data.map((mission) => (
                      <Button
                        onClick={() => setMissionId(mission.id)}
                        className="m-2"
                        variant={missionId === mission.id ? "default" : "secondary"}
                      >
                        {mission.name}
                      </Button>
                    ))}
                  </div>
                </Confirm>
              );
            } else {
              return (
                <div
                  key={i}
                  className={
                    count === 0 || capped || !isRankAllowed
                      ? "filter grayscale"
                      : "hover:cursor-pointer hover:opacity-30"
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    startRandom({ type: setting.type, rank: setting.rank });
                  }}
                >
                  <Image alt="small" src={setting.image} width={256} height={256} />
                  <p className="font-bold">{setting.name}</p>
                  <p>[Random out of {count} available]</p>
                </div>
              );
            }
          })}
        </div>
      )}
    </ContentBox>
  );
}
