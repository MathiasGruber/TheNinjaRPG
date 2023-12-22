import React from "react";
import Image from "next/image";
import StatusBar from "@/layout/StatusBar";
import Countdown from "@/layout/Countdown";
import { secondsFromNow, secondsFromDate } from "@/utils/time";
import { getObjectiveImage } from "@/libs/objectives";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { TimeFrames } from "@/drizzle/constants";
import type { Quest } from "@/drizzle/schema";
import type { AllObjectivesType, ObjectiveRewardType } from "@/validators/objectives";
import type { QuestTrackerType } from "@/validators/objectives";

interface ObjectiveProps {
  titlePrefix?: string | number;
  objective: AllObjectivesType;
  tracker: QuestTrackerType;
  tier?: number;
}

export const Objective: React.FC<ObjectiveProps> = (props) => {
  const { objective, tier, tracker, titlePrefix } = props;
  const { image, title } = getObjectiveImage(objective);

  // Derived status of the objective
  const status = tracker.goals.find((g) => g.id === objective.id);
  const value = status?.value || 0;
  const done = status?.done || ("value" in objective && value >= objective.value);

  // Show the objective
  return (
    <div className="flex flex-row">
      <Image
        className="self-start basis-1/4"
        alt={objective.task}
        src={image}
        width={60}
        height={60}
      />
      <div className="basis-3/4">
        <p className="font-bold pl-2">
          {titlePrefix}
          {title}
        </p>
        <hr className="my-0" />
        <div className="pl-2">
          {"value" in objective && (
            <div className="pr-3 flex flex-row items-center">
              <div className="grow">
                <StatusBar
                  title="Goal"
                  tooltip="Energy"
                  color={getStatusColor(tier, done)}
                  showText={true}
                  current={value > objective.value ? objective.value : value}
                  total={objective.value}
                />
              </div>
              {done === true && <CheckIcon className="h-10 w-10 stroke-green-500" />}
            </div>
          )}
          {"sector" in objective && (
            <div className="flex flex-row items-center">
              <div className="grow">
                <div>
                  <b>Sector: </b> {objective.sector}
                </div>
                <div>
                  <b>Position:</b> [{objective.longitude}, {objective.latitude}]
                </div>
              </div>
              <div>
                {done ? (
                  <CheckIcon className="h-10 w-10 stroke-green-500" />
                ) : (
                  <XMarkIcon className="h-10 w-10 stroke-red-500" />
                )}
              </div>
            </div>
          )}
          <Reward info={objective} />
        </div>
      </div>
    </div>
  );
};

interface RewardProps {
  info?: AllObjectivesType | ObjectiveRewardType | null;
}

export const Reward: React.FC<RewardProps> = (props) => {
  const info = props.info;
  const rewards = `${info?.reward_money ? `${info.reward_money} Ryo` : ""}`;
  return (
    <>
      {rewards && (
        <p>
          <b>Rewards</b>: {rewards}
        </p>
      )}
    </>
  );
};

interface EventTimerProps {
  quest: Quest;
  tracker: QuestTrackerType;
}

export const EventTimer: React.FC<EventTimerProps> = (props) => {
  const { quest, tracker } = props;

  // If the quest is permanent
  if (quest.timeFrame === "all_time" && !quest.expiresAt) return <></>;

  // Get the expiry time based on quest.timeFrame from now(), or expiresAt, whatever comes first:
  const nextYear = secondsFromNow(60 * 60 * 24 * 365);
  const expiresAt = quest.expiresAt || nextYear;
  const expiryTime = secondsFromDate(
    getFreqSeconds(quest.timeFrame),
    new Date(tracker.startAt)
  );
  const targetDate = expiresAt < expiryTime ? new Date(expiresAt) : expiryTime;

  return (
    <div>
      <b>Time Left: </b> <Countdown targetDate={targetDate} />
    </div>
  );
};

const getStatusColor = (tier: number | undefined, done: boolean) => {
  if (done) return "bg-green-500";
  switch (tier) {
    case 1:
      return "bg-green-500";
    case 2:
      return "bg-yellow-500";
    case 2:
      return "bg-red-500";
    default:
      return "bg-blue-500";
  }
};

const getFreqSeconds = (timeFrame: typeof TimeFrames[number]) => {
  switch (timeFrame) {
    case "daily":
      return 60 * 60 * 24;
    case "weekly":
      return 60 * 60 * 24 * 7;
    case "monthly":
      return 60 * 60 * 24 * 30;
    case "all_time":
      return 60 * 60 * 24 * 365;
  }
};
