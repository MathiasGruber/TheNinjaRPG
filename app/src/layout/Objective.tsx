import React, { useState } from "react";
import Image from "next/image";
import StatusBar from "@/layout/StatusBar";
import Countdown from "@/layout/Countdown";
import Modal from "@/layout/Modal";
import { CircleHelp } from "lucide-react";
import { secondsFromNow, secondsFromDate } from "@/utils/time";
import { getObjectiveImage } from "@/libs/objectives";
import { X, Check, Gift } from "lucide-react";
import { hasReward } from "@/validators/objectives";
import { useRequiredUserData } from "@/utils/UserContext";
import { getObjectiveSchema } from "@/validators/objectives";
import { isObjectiveComplete } from "@/libs/objectives";
import type { TimeFrames } from "@/drizzle/constants";
import type { Quest } from "@/drizzle/schema";
import type { AllObjectivesType, ObjectiveRewardType } from "@/validators/objectives";
import type { QuestTrackerType } from "@/validators/objectives";

interface ObjectiveProps {
  titlePrefix?: string | number;
  objective: AllObjectivesType;
  tracker: QuestTrackerType;
  checkRewards: () => void;
  tier?: number;
  grayedOut?: boolean;
}
export const Objective: React.FC<ObjectiveProps> = (props) => {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: userData } = useRequiredUserData();
  const { objective, tier, tracker, titlePrefix, checkRewards } = props;
  const { image, title } = getObjectiveImage(objective);

  // Parse objective
  const objectiveSchema = getObjectiveSchema(objective.task as string);
  const parsed = objectiveSchema.parse(objective);

  // Derived status of the objective
  const { done, value, canCollect } = isObjectiveComplete(tracker, parsed);

  // Indicator icon
  const indicatorIcons = done ? (
    <div className="flex flex-col items-center gap-1">
      <Check className="h-10 w-10 stroke-green-500" />
      {hasReward(parsed) &&
        (canCollect && userData?.status === "AWAKE" ? (
          <Gift
            className="h-7 w-7 cursor-pointer hover:text-orange-500"
            onClick={checkRewards}
          />
        ) : (
          <Gift className="h-7 w-7 fill-slate-500" />
        ))}
    </div>
  ) : (
    <X className="h-10 w-10 stroke-red-500" />
  );
  // Show the objective
  return (
    <div className={`flex flex-row ${props.grayedOut ? "grayscale opacity-30" : ""}`}>
      <Image
        className="self-start basis-1/4"
        alt={parsed.task}
        src={image}
        width={60}
        height={60}
      />
      <div className="basis-3/4">
        <div className="flex flex-row">
          <p className="font-bold pl-2 grow">
            {titlePrefix}
            {title}
          </p>
          {objective.description && objective.description !== "" && (
            <>
              <CircleHelp
                className="h-5 w-5 hover:text-orange-500 hover:cursor-pointer"
                onClick={() => setModalOpen(true)}
              />
              {modalOpen && (
                <Modal title="Objective Details" setIsOpen={() => setModalOpen(false)}>
                  <div dangerouslySetInnerHTML={{ __html: objective.description }} />
                </Modal>
              )}
            </>
          )}
        </div>
        <hr className="my-0" />
        <div className="pl-2">
          {"value" in parsed && (
            <div className="pr-3 flex flex-row items-center">
              <div className="grow">
                <StatusBar
                  title="Goal"
                  tooltip="Status points"
                  color={getStatusColor(tier, done)}
                  showText={true}
                  current={value > parsed.value ? parsed.value : value}
                  total={parsed.value}
                />
              </div>
              {indicatorIcons}
            </div>
          )}
          {"sector" in parsed && (
            <div className="flex flex-row items-center">
              <div className="grow">
                {!parsed.hideLocation && (
                  <>
                    <div>
                      <b>Sector: </b> {parsed.sector}
                    </div>
                    <div>
                      <b>Position:</b> [{parsed.longitude}, {parsed.latitude}]
                    </div>
                  </>
                )}
                {parsed.hideLocation && (
                  <div>
                    <b>Location:</b> hidden
                  </div>
                )}
                <Reward info={parsed} />
              </div>
              <div>{indicatorIcons}</div>
            </div>
          )}
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
  let rewards = `${info?.reward_money ? `${info.reward_money} Ryo` : ""}`;
  if (info?.reward_tokens) {
    rewards += `${rewards ? ", " : ""} ${info.reward_tokens} Tokens`;
  }
  if (info?.reward_clanpoints) {
    rewards += `${rewards ? ", " : ""} ${info.reward_clanpoints} Clan Points`;
  }
  if (info?.reward_exp) {
    rewards += `${rewards ? ", " : ""} ${info.reward_exp} Exp`;
  }
  if (info?.reward_prestige) {
    rewards += `${rewards ? ", " : ""} ${info.reward_prestige} Prestige`;
  }
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
    new Date(tracker.startAt),
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

const getFreqSeconds = (timeFrame: (typeof TimeFrames)[number]) => {
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
