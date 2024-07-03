import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import Image from "next/image";
import ItemWithEffects from "@/layout/ItemWithEffects";
import { LogbookEntry } from "@/layout/Logbook";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/utils/api";
import { availableLetterRanks } from "@/libs/train";
import { useRequireInVillage } from "@/utils/village";

const AdministrationBuilding: NextPage = () => {
  const util = api.useUtils();

  const { userData, access } = useRequireInVillage("/adminbuilding");

  const currentQuest = userData?.userQuests?.find(
    (q) => ["event"].includes(q.quest.questType) && !q.endAt,
  );
  const currentTracker = userData?.questData?.find(
    (q) => q.id === currentQuest?.questId,
  );

  // Query
  const { data: hallData } = api.quests.allianceBuilding.useQuery(
    {
      villageId: userData?.villageId,
      level: userData?.level,
      rank: userData?.rank ? availableLetterRanks(userData.rank) : [],
    },
    { enabled: !!userData, staleTime: Infinity },
  );

  const { mutate: startQuest, isPending } = api.quests.startQuest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await util.profile.getUser.invalidate();
    },
  });

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Hall" />;
  if (userData.isBanned) return <BanInfo />;

  return (
    <ContentBox
      title="Administration Building"
      subtitle="Information Board"
      back_href="/village"
      padding={false}
    >
      <Image
        alt="welcome"
        src="/adminbuilding.webp"
        width={512}
        height={195}
        className="w-full"
        priority={true}
      />
      <p className="p-3">
        Welcome, fellow ninja, to the administration building of Wake Island. I am
        headmaster Tenjiro and it is my privilege to welcome you to this center of
        discovery and challenge. Within these walls, the path to greatness awaits you.
      </p>
      <p className="px-3">
        Listed below, you will find the array of quests currently available for your
        undertaking. As you pursue them, know that our dedicated assistants are here to
        offer guidance and support whenever you require it. They stand ready to aid you
        in your noble pursuits.
      </p>
      {isPending && <Loader explanation="Accepting..." />}
      {currentQuest && currentTracker && (
        <div className="p-3">
          <LogbookEntry userQuest={currentQuest} tracker={currentTracker} />
        </div>
      )}
      {!currentQuest && !isPending && (
        <div className="p-3">
          {hallData?.length === 0 && (
            <p className="font-bold">No current quests for you</p>
          )}
          {hallData?.map((quest, i) => (
            <div key={i}>
              <ItemWithEffects
                item={quest}
                showEdit="quest"
                imageExtra={
                  <Button
                    className="mt-2"
                    onClick={() => startQuest({ questId: quest.id })}
                  >
                    <Gamepad2 className="mr-1 h-6 w-6" />
                    Take Quest
                  </Button>
                }
              />
            </div>
          ))}
        </div>
      )}
    </ContentBox>
  );
};

export default AdministrationBuilding;
