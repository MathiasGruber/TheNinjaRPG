import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { LogbookEntry } from "@/layout/Logbook";
import Image from "next/image";
import Confirm from "@/layout/Confirm";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { useRequiredUserData } from "@/utils/UserContext";

const settings = [
  {
    type: "errand",
    rank: "D",
    name: "Errand",
    image: "/missions/errands.webp",
    description:
      "Errands typically involve simple tasks such as fetching an item somewhere in the village, delivering groceries, etc.",
  },
  {
    type: "mission",
    rank: "D",
    name: "D-rank",
    image: "/missions/D_mission.webp",
    description:
      "D-rank missions are the lowest rank of missions. They are usually simple missions that have a low chance of danger, finding & retrieving items, doing manual labor, or fetching a lost cat",
  },
  {
    type: "mission",
    rank: "C",
    name: "C-rank",
    image: "/missions/C_mission.webp",
    description:
      "C-rank missions are the second lowest rank of missions. They are usually missions that have a chance of danger, e.g. escorting a client through friendly territory, etc.",
  },
  {
    type: "mission",
    rank: "B",
    name: "B-rank",
    image: "/missions/B_mission.webp",
    description:
      "B-rank missions are the third highest rank of missions. They are usually missions that have a decent chance of danger, e.g. escorting a client through neutral or enemy territory.",
  },
  {
    type: "mission",
    rank: "A",
    name: "A-rank",
    image: "/missions/A_mission.webp",
    description:
      "A-rank missions are the second highest rank of missions. They usually have a high chance of danger and are considered to be very difficult, e.g. assassinating a target, etc.",
  },
  {
    type: "mission",
    rank: "S",
    name: "S-rank",
    image: "/missions/S_mission.webp",
    description:
      "S-rank missions are the highest rank of missions. They are usually extremely dangerous and difficult and reserved for kage-level shinobi.",
  },
] as const;

const MissionHall: NextPage = () => {
  const { data: userData, refetch } = useRequiredUserData();

  const currentQuest = userData?.userQuests?.find(
    (q) => ["mission", "crime", "errand"].includes(q.quest.questType) && !q.endAt
  );
  const currentTracker = userData?.questData?.find(
    (q) => q.id === currentQuest?.questId
  );

  const { data: hallData } = api.quests.missionHall.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { mutate: startRandom, isLoading } = api.quests.startRandom.useMutation({
    onSuccess: (data) => {
      void refetch();
    },
    onError: (error) => {
      show_toast("Error getting quest", error.message, "error");
    },
  });

  if (!userData) return <Loader explanation="Loading userdata" />;

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
          <LogbookEntry quest={currentQuest.quest} tracker={currentTracker} />
        </div>
      )}
      {!currentQuest && !isLoading && (
        <div className="grid grid-cols-3 italic p-3 gap-4 text-center">
          {settings.map((setting, i) => {
            const count =
              hallData?.find(
                (point) => point.type === setting.type && point.rank === setting.rank
              )?.count ?? 0;
            return (
              <Confirm
                key={i}
                title="Confirm Activity"
                proceed_label="Accept"
                button={
                  <div
                    className={
                      count === 0
                        ? "filter grayscale"
                        : "hover:cursor-pointer hover:opacity-30"
                    }
                  >
                    <Image alt="small" src={setting.image} width={256} height={256} />
                    <p className="font-bold">{setting.name}</p>
                    <p>[{count} available]</p>
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
