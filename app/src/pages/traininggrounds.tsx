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
import { JUTSU_LEVEL_CAP } from "@/libs/train";
import { ActionSelector } from "@/layout/CombatActions";
import { getDaysHoursMinutesSeconds, getTimeLeftStr } from "@/utils/time";
import { calcJutsuTrainTime, calcJutsuTrainCost } from "@/libs/train";
import { checkJutsuRank, checkJutsuVillage, checkJutsuBloodline } from "@/libs/train";
import { useRequiredUserData } from "@/utils/UserContext";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequireInVillage } from "@/utils/village";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { BoltIcon, XCircleIcon } from "@heroicons/react/24/solid";
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
  const { data: userData, timeDiff } = useRequiredUserData();

  // Ensure user is in village
  useRequireInVillage();

  // While loading userdata
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Show components if we have user
  return (
    <>
      <StatsTraining userData={userData} timeDiff={timeDiff} />
      <JutsuTraining userData={userData} timeDiff={timeDiff} />
    </>
  );
};

export default Training;

interface TrainingProps {
  userData: NonNullable<UserWithRelations>;
  timeDiff: number;
}

const StatsTraining: React.FC<TrainingProps> = (props) => {
  // Settings
  const { userData, timeDiff } = props;
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
                timeDiff={timeDiff}
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
  const { userData, timeDiff } = props;
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
    },
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
    (jutsu) => jutsu.finishTraining && jutsu.finishTraining > now,
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

  const { mutate: cancel, isLoading: isStoppingTrain } =
    api.jutsu.stopTraining.useMutation({
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

  // Mutation loading
  const isLoading = isStartingTrain || isStoppingTrain;

  // While loading userdata
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Derived calculations
  const level = userJutsuCounts?.find((entry) => entry.id === jutsu?.id)?.quantity || 0;
  const trainSeconds =
    jutsu &&
    getTimeLeftStr(...getDaysHoursMinutesSeconds(calcJutsuTrainTime(jutsu, level)));
  const cost = (jutsu && calcJutsuTrainCost(jutsu, level)) || 0;
  const okRank = checkJutsuRank(jutsu?.jutsuRank, userData.rank);
  const okVillage = checkJutsuVillage(jutsu, userData);
  const okBloodline = checkJutsuBloodline(jutsu, userData);
  const canAfford = userData && cost && userData.money >= cost;
  const isCapped = level >= JUTSU_LEVEL_CAP;
  const canTrain = okRank && okVillage && okBloodline && !isCapped && canAfford;

  // Label for proceed button
  let proceed_label: string | undefined = undefined;
  if (!isLoading && !isCapped) {
    if (!canAfford) {
      proceed_label = `Need ${cost - userData.money} more ryo`;
    } else if (isCapped) {
      proceed_label = `Level capped`;
    } else if (!okRank) {
      proceed_label = `Cannot train ${jutsu?.jutsuRank} rank`;
    } else if (!okVillage) {
      proceed_label = `Wrong village`;
    } else if (!okBloodline) {
      proceed_label = `Wrong bloodline`;
    } else if (trainSeconds && cost) {
      proceed_label = `Train [${trainSeconds}, ${cost} ryo]`;
    }
  }

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
                proceed_label={proceed_label}
                setIsOpen={setIsOpen}
                isValid={false}
                onAccept={() => {
                  if (canTrain && !isLoading) {
                    train({ jutsuId: jutsu.id });
                  } else {
                    setIsOpen(false);
                  }
                }}
                confirmClassName={
                  canTrain
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }
              >
                <div className="relative">
                  <p className="pb-3">You have {userData.money} ryo in your pocket</p>
                  {!isLoading && (
                    <ItemWithEffects
                      item={jutsu}
                      key={jutsu.id}
                      showStatistic="jutsu"
                    />
                  )}
                  {isLoading && <Loader explanation={`Training ${jutsu.name}`} />}
                </div>
              </Modal>
            )}
          </>
        )}
        {isFetching && <Loader explanation="Loading jutsu" />}
        {finishTrainingAt?.finishTraining && (
          <div className="min-h-36">
            <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black opacity-90">
              <div className="m-auto text-center text-white">
                <p className="p-5  text-3xl">Training</p>
                <p className="text-2xl">
                  Time Left:{" "}
                  <Countdown
                    targetDate={finishTrainingAt.finishTraining}
                    timeDiff={timeDiff}
                    onFinish={async () => {
                      await refetchUserJutsu();
                    }}
                  />
                </p>
                <XCircleIcon
                  className="w-10 h-10 m-auto mt-5 fill-red-500 cursor-pointer hover:fill-orange-500"
                  onClick={() => cancel()}
                />
              </div>
            </div>
          </div>
        )}
      </ContentBox>
    </>
  );
};
