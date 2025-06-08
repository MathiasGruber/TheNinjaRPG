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
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
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
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState<number>(0);
  const { data: userData } = useRequiredUserData();
  const { objective, tier, tracker, titlePrefix, checkRewards } = props;
  const { image, title } = getObjectiveImage(objective);

  const { mutate: answerQuestion, isPending: isAnswering } = api.quests.answerMultipleChoice.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setQuestionModalOpen(false);
        checkRewards();
      } else {
        // Set 3 minute cooldown
        setCooldownEnd(Date.now() + 3 * 60 * 1000);
      }
    },
  });

  // Parse objective
  const objectiveSchema = getObjectiveSchema(objective.task as string);
  const parsed = objectiveSchema.parse(objective);

  // Derived status of the objective
  const { done, value, canCollect } = isObjectiveComplete(tracker, parsed);

  // Check if user is at the correct location for multiple choice
  const isAtLocation = parsed.task === "multiple_choice" && 
    userData?.sector === parsed.sector &&
    userData?.latitude === parsed.latitude &&
    userData?.longitude === parsed.longitude;

  // Calculate remaining cooldown time
  const remainingCooldown = Math.max(0, cooldownEnd - Date.now());
  const isOnCooldown = remainingCooldown > 0;

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
                    {parsed.task === "multiple_choice" && !done && isAtLocation && (
                      <button
                        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        onClick={() => setQuestionModalOpen(true)}
                      >
                        Answer Question
                      </button>
                    )}
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

      {/* Multiple Choice Question Modal */}
      {questionModalOpen && parsed.task === "multiple_choice" && (
        <Modal 
          title="Question" 
          setIsOpen={() => {
            setQuestionModalOpen(false);
            setCooldownEnd(0);
          }}
          className="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-lg font-medium">{parsed.question}</p>
            {isOnCooldown && (
              <p className="text-red-500 font-medium">
                Incorrect answer. Please wait {Math.ceil(remainingCooldown / 1000 / 60)} minutes before trying again.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {parsed.choices.map((choice, index) => (
                <button
                  key={index}
                  className="px-4 py-2 text-left border rounded hover:bg-slate-100 disabled:opacity-50"
                  onClick={() => answerQuestion({
                    questId: tracker.id,
                    objectiveId: objective.id,
                    answer: index
                  })}
                  disabled={isAnswering || isOnCooldown}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

interface RewardProps {
  info?: AllObjectivesType | ObjectiveRewardType | null;
  rewardMultiplier?: number;
}

export const Reward: React.FC<RewardProps> = (props) => {
  const { info, rewardMultiplier } = props;
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
          {rewardMultiplier && rewardMultiplier !== 1.0 && (
            <>
              <br />
              <span className="text-sm text-red-500">
                Will only give {rewardMultiplier * 100}% Rewards
              </span>
            </>
          )}
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
