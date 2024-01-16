import { useState } from "react";
import Image from "next/image";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Modal from "@/layout/Modal";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Countdown from "@/layout/Countdown";
import StatusBar from "@/layout/StatusBar";
import NavTabs from "@/layout/NavTabs";
import Button from "@/layout/Button";
import JutsuFiltering, { useFiltering, getFilter } from "@/layout/JutsuFiltering";
import { energyPerSecond } from "@/libs/train";
import { trainEfficiency } from "@/libs/train";
import { ActionSelector } from "@/layout/CombatActions";
import { getDaysHoursMinutesSeconds, getTimeLeftStr } from "@/utils/time";
import { canTrainJutsu, calcJutsuTrainTime, calcJutsuTrainCost } from "@/libs/train";
import { useRequiredUserData } from "@/utils/UserContext";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequireInVillage } from "@/utils/village";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { BoltIcon } from "@heroicons/react/24/solid";
import { ShieldExclamationIcon } from "@heroicons/react/24/solid";
import { FingerPrintIcon } from "@heroicons/react/24/solid";
import { UserStatNames } from "@/drizzle/constants";
import { TrainingSpeeds } from "@/drizzle/constants";
import type { TrainingSpeed } from "@/drizzle/constants";
import type { Jutsu } from "@/drizzle/schema";
import type { NextPage } from "next";
import type { UserWithRelations } from "@/server/api/routers/profile";

const Training: NextPage = () => {
  // Get user data
  const { data: userData } = useRequiredUserData();

  // Ensure user is in village
  useRequireInVillage();

  // While loading userdata
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Show components if we have user
  return (
    <>
      <StatsTraining userData={userData} />
      <JutsuTraining userData={userData} />
    </>
  );
};

export default Training;

interface TrainingProps {
  userData: NonNullable<UserWithRelations>;
}

const StatsTraining: React.FC<TrainingProps> = (props) => {
  // Settings
  const { userData } = props;
  const efficiency = trainEfficiency(userData.trainingSpeed);

  // tRPC useUtils
  const utils = api.useUtils();

  // Mutations
  const { mutate: startTraining, isLoading: isStarting } =
    api.profile.startTraining.useMutation({
      onSuccess: async (data) => {
        show_toast("Training", data.message, "info");
        if (data.success) {
          await utils.profile.getUser.invalidate();
        }
      },
      onError: (error) => {
        show_toast("Error training", error.message, "error");
      },
    });

  const { mutate: stopTraining, isLoading: isStopping } =
    api.profile.stopTraining.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          show_toast("Training", data.message, "success");
          await utils.profile.getUser.invalidate();
        } else {
          show_toast("Training", data.message, "info");
        }
      },
      onError: (error) => {
        show_toast("Error training", error.message, "error");
      },
    });

  const { mutate: changeSpeed, isLoading: isChaning } =
    api.profile.updateTrainingSpeed.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          show_toast("Training", data.message, "success");
          await utils.profile.getUser.invalidate();
        } else {
          show_toast("Training", data.message, "info");
        }
      },
      onError: (error) => {
        show_toast("Error training", error.message, "error");
      },
    });

  const isLoading = isStarting || isStopping || isChaning;

  // Convenience definitions
  const trainItemClassName = "hover:opacity-50 hover:cursor-pointer relative";
  const iconClassName = "w-5 h-5 absolute top-1 right-1 fill-blue-500";

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (isLoading) return <Loader explanation="Processing..." />;

  return (
    <ContentBox
      title="Training"
      subtitle={`Training (${efficiency}% efficiency)`}
      back_href="/village"
      topRightContent={
        <NavTabs
          current={userData.trainingSpeed}
          options={TrainingSpeeds}
          setValue={(value) => changeSpeed({ speed: value as TrainingSpeed })}
        />
      }
    >
      <div className="grid grid-cols-4 text-center font-bold">
        {UserStatNames.map((stat, i) => {
          const part = stat.match(/[a-z]+/g)?.[0] as string;
          const label = part.charAt(0).toUpperCase() + part.slice(1);
          const icon = stat.includes("Offence") ? (
            <BoltIcon className={iconClassName} />
          ) : stat.includes("Defence") ? (
            <ShieldExclamationIcon className={iconClassName} />
          ) : (
            <FingerPrintIcon className={iconClassName} />
          );
          return (
            <div
              key={i}
              className={trainItemClassName}
              onClick={() => startTraining({ stat })}
            >
              <Image
                src={`/training/${stat}.png`}
                alt={label}
                width={256}
                height={256}
              />
              {icon}
              {label}
            </div>
          );
        })}
      </div>
      {userData.currentlyTraining && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto bg-black opacity-95">
          <div className="m-auto text-center text-white flex flex-col items-center">
            <p className="p-5  text-2xl">Training {userData.currentlyTraining}</p>
            <Image
              src={`/training/${userData.currentlyTraining}.png`}
              alt={userData.currentlyTraining}
              width={128}
              height={128}
            />
            <div className="w-2/3">
              <StatusBar
                title="Energy"
                tooltip="Energy"
                color="bg-yellow-500"
                showText={true}
                lastRegenAt={userData.trainingStartedAt}
                regen={-energyPerSecond(userData.trainingSpeed)}
                status={userData.status}
                current={userData.curEnergy}
                total={userData.maxEnergy}
              />
              <Button
                className="mt-3"
                id="return"
                label="Finish Training"
                onClick={() => stopTraining()}
              />
            </div>
          </div>
        </div>
      )}
    </ContentBox>
  );
};

const JutsuTraining: React.FC<TrainingProps> = (props) => {
  // Settings
  const { userData } = props;
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [jutsu, setJutsu] = useState<Jutsu | undefined>(undefined);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const now = new Date();

  // tRPC useUtils
  const utils = api.useUtils();

  // Two-level filtering
  const state = useFiltering();

  // Jutsus
  const {
    data: jutsus,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.jutsu.getAll.useInfiniteQuery(
    { limit: 100, hideAi: true, ...getFilter(state) },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
      enabled: userData !== undefined,
    }
  );
  const alljutsus = jutsus?.pages
    .map((page) => page.data)
    .flat()
    .filter((j) => !j.villageId || userData?.villageId === j.villageId)
    .filter((j) => !j.bloodlineId || j.bloodlineId === userData?.bloodlineId);
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
      onSuccess: async (data) => {
        show_toast("Training", data.message, "info");
        if (data.success) {
          await refetchUserJutsu();
          await utils.profile.getUser.invalidate();
        }
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
  const level = userJutsuCounts?.find((entry) => entry.id === jutsu?.id)?.quantity || 0;
  const trainSeconds =
    jutsu &&
    getTimeLeftStr(...getDaysHoursMinutesSeconds(calcJutsuTrainTime(jutsu, level)));
  const trainCost = (jutsu && calcJutsuTrainCost(jutsu, level)) || 0;
  const canTrain = jutsu && userData && canTrainJutsu(jutsu, userData);
  const canAfford = userData && trainCost && userData.money >= trainCost;

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <>
      <ContentBox
        title="Techniques"
        subtitle="Jutsu Techniques"
        back_href="/village"
        initialBreak={true}
        topRightContent={
          <JutsuFiltering state={state} fixedBloodline={userData.bloodlineId} />
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
              lastElement={lastElement}
              setLastElement={setLastElement}
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
                {!isStartingTrain && (
                  <ItemWithEffects item={jutsu} key={jutsu.id} showStatistic="jutsu" />
                )}
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
    </>
  );
};
