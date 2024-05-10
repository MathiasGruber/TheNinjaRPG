import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import { LogbookEntry } from "@/layout/Logbook";
import Image from "next/image";
import Confirm from "@/layout/Confirm";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/utils/api";
import { availableLetterRanks } from "@/libs/train";
import { getQuestCounterFieldName } from "@/validators/user";
import { missionHallSettings } from "@/libs/quest";
import { useRequireInVillage } from "@/utils/village";
import { MISSIONS_PER_DAY } from "@/drizzle/constants";

const MissionHall: NextPage = () => {
  const util = api.useUtils();

  const { userData, access } = useRequireInVillage("/missionhall");

  const currentQuest = userData?.userQuests?.find(
    (q) => ["mission", "crime", "errand"].includes(q.quest.questType) && !q.endAt,
  );
  const currentTracker = userData?.questData?.find(
    (q) => q.id === currentQuest?.questId,
  );

  const { data: hallData } = api.quests.missionHall.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { mutate: startRandom, isPending } = api.quests.startRandom.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await util.profile.getUser.invalidate();
    },
  });

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Mission Hall" />;
  if (userData.isBanned) return <BanInfo />;

  // Derived
  const availableUserRanks = availableLetterRanks(userData.rank);
  const missionsLeft = MISSIONS_PER_DAY - userData.dailyMissions;

  return (
    <ContentBox
      title="Mission Hall"
      subtitle={`Daily missions [${userData.dailyMissions} / ${MISSIONS_PER_DAY}]`}
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
            const isRankAllowed = availableUserRanks.includes(setting.rank);
            // Completed field on user model
            const missionOrCrime = userData?.villageId === "" ? "crime" : "mission";
            const type = setting.type === "errand" ? "errand" : missionOrCrime;
            const completedField = getQuestCounterFieldName(type, setting.rank);
            return (
              <Confirm
                key={i}
                title="Confirm Activity"
                proceed_label="Accept"
                button={
                  <div
                    className={
                      count === 0 || missionsLeft <= 0 || !isRankAllowed
                        ? "filter grayscale"
                        : "hover:cursor-pointer hover:opacity-30"
                    }
                  >
                    <Image alt="small" src={setting.image} width={256} height={256} />
                    <p className="font-bold">{setting.name}</p>
                    <p>[{count} available]</p>
                    {completedField && <p>[{userData[completedField]} completed]</p>}
                  </div>
                }
                onAccept={(e) => {
                  e.preventDefault();
                  startRandom({ type: setting.type, rank: setting.rank });
                }}
              >
                {isPending && <Loader explanation="Accepting..." />}
                {!isPending && (
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
