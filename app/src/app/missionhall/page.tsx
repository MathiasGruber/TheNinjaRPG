"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import { LogbookEntry } from "@/layout/Logbook";
import Image from "next/image";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/utils/api";
import { availableQuestLetterRanks } from "@/libs/train";
import { getQuestCounterFieldName } from "@/validators/user";
import { missionHallSettings } from "@/libs/quest";
import { useRequireInVillage } from "@/utils/UserContext";
import { MISSIONS_PER_DAY } from "@/drizzle/constants";

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
    { villageId: userData?.villageId ?? "" },
    { enabled: !!userData, staleTime: Infinity },
  );

  const { mutate: startRandom, isPending } = api.quests.startRandom.useMutation({
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
  const classifier = userData.isOutlaw ? "crime" : "mission";

  return (
    <ContentBox
      title={userData.isOutlaw ? "Crimes Board" : "Mission Hall"}
      subtitle={`Daily ${classifier}s [${userData.dailyMissions} / ${MISSIONS_PER_DAY}]`}
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
      {isPending && <Loader explanation="Accepting..." />}
      {currentQuest && currentTracker && (
        <div className="p-3">
          <LogbookEntry userQuest={currentQuest} tracker={currentTracker} />
        </div>
      )}
      {!currentQuest && !isPending && (
        <div className="grid grid-cols-3 italic p-3 gap-4 text-center">
          {missionHallSettings.map((setting, i) => {
            // Count how many of this type and rank are available
            const count =
              hallData?.find(
                (point) => point.type === setting.type && point.rank === setting.rank,
              )?.count ?? 0;
            // Check is user rank is high enough for this quest
            const isRankAllowed =
              availableUserRanks.includes(setting.rank) || setting.name === "Errand";
            // Completed field on user model
            const missionOrCrime = userData?.villageId === "" ? "crime" : "mission";
            const type = setting.type === "errand" ? "errand" : missionOrCrime;
            const completedField = getQuestCounterFieldName(type, setting.rank);
            return (
              <div
                key={i}
                className={
                  count === 0 || missionsLeft <= 0 || !isRankAllowed
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
                <p>[{count} available]</p>
                {completedField && <p>[{userData[completedField]} completed]</p>}
              </div>
            );
          })}
        </div>
      )}
    </ContentBox>
  );
}
