import { useState } from "react";
import Image from "next/image";
import ItemWithEffects from "../layout/ItemWithEffects";
import Modal from "../layout/Modal";
import ContentBox from "../layout/ContentBox";
import NavTabs from "../layout/NavTabs";
import Loader from "../layout/Loader";
import Countdown from "../layout/Countdown";
import StatusBar from "../layout/StatusBar";
import Button from "../layout/Button";
import SelectField from "../layout/SelectField";
import { ENERGY_SPENT_PER_SECOND } from "../libs/train";
import { ActionSelector } from "../layout/CombatActions";
import { getDaysHoursMinutesSeconds, getTimeLeftStr } from "../utils/time";
import { canTrainJutsu, calcJutsuTrainTime, calcJutsuTrainCost } from "../libs/train";
import { useRequiredUserData } from "../utils/UserContext";
import { useInfinitePagination } from "../libs/pagination";
import { useRequireInVillage } from "../utils/village";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { BoltIcon } from "@heroicons/react/24/solid";
import { ShieldExclamationIcon } from "@heroicons/react/24/solid";
import { FingerPrintIcon } from "@heroicons/react/24/solid";
import { UserStatNames } from "../../drizzle/constants";
import { Filters } from "../libs/train";
import type { FilterType } from "../libs/train";
import type { JutsuRank, Jutsu } from "../../drizzle/schema";
import type { NextPage } from "next";

const Training: NextPage = () => {
  // Get user data
  const { data: userData } = useRequiredUserData();

  // Ensure user is in village
  useRequireInVillage();

  // While loading userdata
  if (!userData) return <Loader explanation="Loading userdata" />;
  return (
    <>
      <StatsTraining />
      <JutsuTraining />
    </>
  );
};

export default Training;

const StatsTraining: React.FC = () => {
  // Settings
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Mutations
  const { mutate: startTraining, isLoading: isStarting } =
    api.profile.startTraining.useMutation({
      onSuccess: async (data) => {
        show_toast("Training", data.message, "info");
        if (data.success) {
          await refetchUser();
        }
      },
      onError: (error) => {
        show_toast("Error training", error.message, "error");
      },
      onSettled: () => {
        setIsOpen(false);
      },
    });

  const { mutate: stopTraining, isLoading: isStopping } =
    api.profile.stopTraining.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          show_toast("Training", data.message, "success");
          await refetchUser();
        } else {
          show_toast("Training", data.message, "info");
        }
      },
      onError: (error) => {
        show_toast("Error training", error.message, "error");
      },
      onSettled: () => {
        setIsOpen(false);
      },
    });

  const isLoading = isStarting || isStopping;

  // Convenience definitions
  const trainItemClassName = "hover:opacity-50 hover:cursor-pointer relative";
  const iconClassName = "w-5 h-5 absolute top-1 right-1 fill-blue-500";

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox title="Training" subtitle="Character Training" back_href="/village">
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
            <p className="text-2xl">
              {/* <Countdown
                targetDate={finishTrainingAt.finishTraining}
                onFinish={async () => {
                  await refetchUserJutsu();
                }}
              /> */}
            </p>
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
                regen={-ENERGY_SPENT_PER_SECOND}
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

const JutsuTraining: React.FC = () => {
  // Settings
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [jutsu, setJutsu] = useState<Jutsu | undefined>(undefined);
  const [rarity, setRarity] = useState<JutsuRank>("D");
  const [filter, setFilter] = useState<FilterType>(Filters[0]);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const now = new Date();

  // Jutsus
  const {
    data: jutsus,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.jutsu.getAll.useInfiniteQuery(
    { rarity: rarity, limit: 100, filter: filter },
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
    .filter((jutsu) => !jutsu.villageId || userData?.villageId === jutsu.villageId)
    .filter(
      (jutsu) =>
        !userData ||
        filter !== "Bloodline" ||
        (jutsu.bloodlineId === userData.bloodlineId && userData.bloodlineId !== "")
    );
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
          await refetchUser();
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
          <div className="flex flex-col">
            <SelectField
              id="filter"
              onChange={(e) => setFilter(e.target.value as FilterType)}
            >
              {Filters.map((filter) => {
                return (
                  <option key={filter} value={filter}>
                    {filter}
                  </option>
                );
              })}
            </SelectField>
            <NavTabs
              current={rarity}
              options={["D", "C", "B", "A", "S"]}
              setValue={setRarity}
            />
          </div>
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
    </>
  );
};
