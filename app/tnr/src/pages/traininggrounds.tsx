import { useState } from "react";
import ItemWithEffects from "../layout/ItemWithEffects";
import Modal from "../layout/Modal";
import ContentBox from "../layout/ContentBox";
import NavTabs from "../layout/NavTabs";
import Loader from "../layout/Loader";
import Countdown from "../layout/Countdown";
import { ActionSelector } from "../layout/CombatActions";
import { getDaysHoursMinutesSeconds, getTimeLeftStr } from "../utils/time";
import { canTrainJutsu, calcTrainTime, calcTrainCost } from "../libs/jutsu/jutsu";
import { useRequiredUserData } from "../utils/UserContext";
import { useInfinitePagination } from "../libs/pagination";
import { useAwake } from "../utils/routing";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import type { JutsuRank, Jutsu } from "../../drizzle/schema";
import type { NextPage } from "next";

const Training: NextPage = () => {
  // Settings
  const { data: userData } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [jutsu, setJutsu] = useState<Jutsu | undefined>(undefined);
  const [rarity, setRarity] = useState<JutsuRank>("D");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const isAwake = useAwake(userData);
  const now = new Date();

  // Jutsus
  const {
    data: jutsus,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.jutsu.getAll.useInfiniteQuery(
    { rarity: rarity, limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const alljutsus = jutsus?.pages
    .map((page) => page.data)
    .flat()
    .filter((jutsu) => !jutsu.villageId || userData?.villageId === jutsu.villageId);
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // User Jutsus
  const { data: userJutsus, refetch: refetchUserJutsu } =
    api.jutsu.getUserJutsus.useQuery(undefined, {
      staleTime: Infinity,
    });
  const userJutsuCounts = userJutsus?.map((userJutsu) => {
    return {
      id: userJutsu.jutsuId,
      quantity:
        userJutsu.finishTraining && userJutsu.finishTraining > now
          ? userJutsu.level - 1
          : userJutsu.level,
    };
  });
  const finishTrainingAt = userJutsus?.find(
    (jutsu) => jutsu.finishTraining && jutsu.finishTraining > now
  );

  // Mutations
  const { mutate: train, isLoading: isStartingTrain } =
    api.jutsu.startTraining.useMutation({
      onSuccess: async () => {
        await refetchUserJutsu();
      },
      onError: (error) => {
        show_toast("Error training", error.message, "error");
      },
      onSettled: () => {
        setIsOpen(false);
        setJutsu(undefined);
      },
    });

  // Derived calculations
  const level = userJutsuCounts?.find((jutsu) => jutsu.id === jutsu?.id)?.quantity || 0;
  const trainSeconds =
    jutsu && getTimeLeftStr(...getDaysHoursMinutesSeconds(calcTrainTime(jutsu, level)));
  const trainCost = (jutsu && calcTrainCost(jutsu, level)) || 0;
  const canTrain = jutsu && userData && canTrainJutsu(jutsu, userData);
  const canAfford = userData && trainCost && userData.money >= trainCost;

  return (
    <>
      {isAwake && (
        <ContentBox
          title="Training"
          subtitle="Jutsu Techniques"
          back_href="/village"
          topRightContent={
            <>
              <div className="grow"></div>
              <NavTabs
                current={rarity}
                options={["D", "C", "B", "A", "S"]}
                setValue={setRarity}
              />
            </>
          }
        >
          {!isFetching && userData && (
            <>
              <ActionSelector
                items={alljutsus}
                counts={userJutsuCounts}
                selectedId={jutsu?.id}
                labelSingles={true}
                onClick={(id) => {
                  if (id == jutsu?.id) {
                    setJutsu(undefined);
                    setIsOpen(false);
                  } else {
                    setJutsu(alljutsus?.find((jutsu) => jutsu.id === id));
                    setIsOpen(true);
                  }
                }}
                showBgColor={false}
                showLabels={true}
              />
              {isOpen && jutsu && (
                <Modal
                  title="Confirm Purchase"
                  proceed_label={
                    !isStartingTrain
                      ? canTrain && canAfford && trainSeconds && trainCost
                        ? `Train [${trainSeconds}, ${trainCost} ryo]`
                        : canAfford
                        ? "Not Available"
                        : `Need ${trainCost - userData.money} more ryo`
                      : undefined
                  }
                  setIsOpen={setIsOpen}
                  isValid={false}
                  onAccept={() => {
                    if (canTrain && canAfford && !isStartingTrain) {
                      train({ jutsuId: jutsu.id });
                    } else {
                      setIsOpen(false);
                    }
                  }}
                  confirmClassName={
                    canTrain && canAfford
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-red-600 text-white hover:bg-red-700"
                  }
                >
                  <p className="pb-3">You have {userData.money} ryo in your pocket</p>
                  {!isStartingTrain && <ItemWithEffects item={jutsu} key={jutsu.id} />}
                  {isStartingTrain && <Loader explanation={`Training ${jutsu.name}`} />}
                </Modal>
              )}
            </>
          )}
          {isFetching && <Loader explanation="Loading jutsu" />}
          {finishTrainingAt?.finishTraining && (
            <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black opacity-90">
              <div className="m-auto text-center text-white">
                <p className="p-5  text-3xl">Training</p>
                <p className="text-2xl">
                  Time Left:{" "}
                  <Countdown
                    targetDate={finishTrainingAt.finishTraining}
                    onFinish={async () => {
                      await refetchUserJutsu();
                    }}
                  />
                </p>
              </div>
            </div>
          )}
        </ContentBox>
      )}
      {!isAwake && <Loader explanation="Loading userdata" />}
    </>
  );
};

export default Training;
