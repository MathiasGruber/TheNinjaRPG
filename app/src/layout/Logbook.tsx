import React, { useState, useEffect } from "react";
import Post from "./Post";
import Image from "next/image";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Confirm2 from "@/layout/Confirm2";
import Accordion from "@/layout/Accordion";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Loader2 } from "lucide-react";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { Objective, Reward, EventTimer } from "@/layout/Objective";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import { parseHtml } from "@/utils/parse";
import { isQuestObjectiveAvailable } from "@/libs/objectives";
import { isQuestComplete } from "@/libs/objectives";
import {
  MISSIONS_PER_DAY,
  ADDITIONAL_MISSION_REWARD_MULTIPLIER,
  IMG_SCENE_BACKGROUND,
  IMG_SCENE_CHARACTER,
} from "@/drizzle/constants";
import { getActiveObjective } from "@/libs/objectives";
import { cn } from "src/libs/shadui";
import type { QuestTrackerType } from "@/validators/objectives";
import type { UserQuest } from "@/drizzle/schema";
import type { ArrayElement } from "@/utils/typeutils";

const tabs = ["Active", "History", "Battles", "Achievements"] as const;
type tabType = (typeof tabs)[number];

const Logbook: React.FC = () => {
  // State
  const [tab, setTab] = useState<tabType | null>(null);

  return (
    <ContentBox
      id="tutorial-logbook"
      title="LogBook"
      subtitle="Character Activites"
      initialBreak={true}
      padding={false}
      topRightContent={
        <NavTabs id="logbook-toggle" current={tab} options={tabs} setValue={setTab} />
      }
    >
      {tab === "Active" && <LogbookActive />}
      {tab === "History" && <LogbookHistory />}
      {tab === "Battles" && <LogbookBattles />}
      {tab === "Achievements" && <LogbookAchievements />}
    </ContentBox>
  );
};

/**
 * Renders the achievements logbook component.
 * Shows quests marked as tier and achievement types.
 *
 * @component
 * @example
 * ```tsx
 * <LogbookAchievements />
 * ```
 */
const LogbookAchievements: React.FC = () => {
  const { data: userData } = useRequiredUserData();
  const [activeElement, setActiveElement] = useState<string>("");
  const quests = userData?.userQuests.filter((uq) =>
    ["tier", "achievement"].includes(uq.quest.questType),
  );

  // Mutation
  const { checkRewards } = useCheckRewards();

  useEffect(() => {
    if (quests && quests.length > 0 && !activeElement) {
      const firstAchievement = quests[0];
      if (firstAchievement) {
        setActiveElement(firstAchievement.quest.name);
      }
    }
  }, [quests, activeElement]);

  return (
    <div className="">
      {userData?.userQuests
        .filter((uq) => ["tier", "achievement"].includes(uq.quest.questType))
        .filter((uq) => uq.completed === 0)
        ?.map((uq, i) => {
          const tracker = userData?.questData?.find((q) => q.id === uq.questId);
          const check = uq.quest.questType === "achievement" && !uq.completed;
          const allDone = tracker?.goals.every((g) => g.done);
          if (check && allDone && userData?.status === "AWAKE") {
            void checkRewards({ questId: uq.quest.id });
          }

          return (
            tracker && (
              <Accordion
                key={i}
                title={uq.quest.name}
                selectedTitle={activeElement}
                titlePrefix={`${capitalizeFirstLetter(uq.quest.questType)}: `}
                onClick={setActiveElement}
              >
                <LogbookEntry key={i} userQuest={uq} tracker={tracker} hideTitle />
              </Accordion>
            )
          );
        })}
    </div>
  );
};

export default Logbook;

/**
 * Renders the active logbook component.
 * @returns The active logbook component.
 */
const LogbookActive: React.FC = () => {
  const { data: userData } = useRequiredUserData();
  const [activeElement, setActiveElement] = useState<string>("");
  const quests = userData?.userQuests.filter(
    (uq) => !["tier", "achievement"].includes(uq.quest.questType),
  );

  useEffect(() => {
    if (quests && !activeElement && quests.length > 0) {
      const firstUserQuest = quests[0];
      if (firstUserQuest) {
        setActiveElement(firstUserQuest.quest.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quests]);

  return (
    <div className="">
      {quests?.map((uq, i) => {
        const tracker = userData?.questData?.find((q) => q.id === uq.questId);
        return (
          tracker && (
            <Accordion
              key={i}
              title={uq.quest.name}
              selectedTitle={activeElement}
              titlePrefix={`${capitalizeFirstLetter(uq.quest.questType)}: `}
              onClick={setActiveElement}
            >
              <LogbookEntry key={i} userQuest={uq} tracker={tracker} hideTitle />
            </Accordion>
          )
        );
      })}
    </div>
  );
};

/**
 * Renders a logbook of battles.
 *
 * @component
 * @example
 * ```tsx
 * <LogbookBattles />
 * ```
 */
const LogbookBattles: React.FC = () => {
  const { data: history, isPending } = api.combat.getBattleHistory.useQuery({
    secondsBack: 3600 * 3,
  });
  const allHistory = history?.map((e) => ({
    attackerUsername: e.attacker.username,
    attackerUserId: e.attacker.userId,
    attackerAvatar: e.attacker.avatar,
    defenderUsername: e.defender.username,
    defenderUserId: e.defender.userId,
    defenderAvatar: e.defender.avatar,
    battleId: e.battleId,
    createdAt: e.createdAt,
  }));

  type Entry = ArrayElement<typeof allHistory>;

  const columns: ColumnDefinitionType<Entry, keyof Entry>[] = [
    { key: "attackerAvatar", header: "Attacker", type: "avatar" },
    { key: "defenderAvatar", header: "Defender", type: "avatar" },
    { key: "battleId", header: "Battle ID", type: "string" },
    { key: "createdAt", header: "Date", type: "date" },
  ];

  if (isPending) return <Loader explanation="Loading battles..." />;

  return (
    <Table
      data={allHistory}
      columns={columns}
      linkPrefix="/battlelog/"
      linkColumn={"battleId"}
    />
  );
};

/**
 * Renders a logbook history component.
 *
 * @component
 * @example
 * ```tsx
 * <LogbookHistory />
 * ```
 */
const LogbookHistory: React.FC = () => {
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Queries
  const {
    data: history,
    fetchNextPage,
    hasNextPage,
    isPending,
  } = api.quests.getQuestHistory.useInfiniteQuery(
    {
      limit: 10,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );
  const allHistory = history?.pages
    .map((page) => page.data)
    .flat()
    .filter((e) => e.quest)
    .map((e) => {
      return {
        image: e.quest.image,
        questType: e.questType,
        name: e.quest.name,
        info: (
          <div>
            <p>
              <b>Start:</b> {e.startedAt.toLocaleString()}
            </p>
            {e.endAt && (
              <p>
                <b>End:</b> {e.endAt.toLocaleString()}
              </p>
            )}
            {e.completed === 1 ? (
              <p className="text-green-500">Completed</p>
            ) : (
              <p className="text-red-500">Not Completed</p>
            )}
          </div>
        ),
      };
    });

  type Entry = ArrayElement<typeof allHistory>;
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  const columns: ColumnDefinitionType<Entry, keyof Entry>[] = [
    { key: "image", header: "", type: "avatar" },
    { key: "questType", header: "Type", type: "string" },
    { key: "name", header: "Title", type: "string" },
    { key: "info", header: "Info", type: "jsx" },
  ];

  if (isPending) return <Loader explanation="Loading history..." />;

  return <Table data={allHistory} columns={columns} setLastElement={setLastElement} />;
};

interface LogbookEntryProps {
  userQuest: UserQuest;
  tracker: QuestTrackerType;
  showScene?: boolean;
  hideTitle?: boolean;
}

/**
 * Represents a logbook entry component.
 *
 * @component
 * @example
 * ```tsx
 * <LogbookEntry userQuest={userQuest} tracker={tracker} />
 * ```
 *
 * @param props - The component props.
 * @returns The rendered component.
 */
export const LogbookEntry: React.FC<LogbookEntryProps> = (props) => {
  const { data: userData } = useRequiredUserData();
  const { userQuest, tracker, hideTitle, showScene } = props;
  const quest = userQuest.quest;
  const tierOrDaily = ["tier", "daily"].includes(quest.questType);
  const missionOrCrime = ["mission", "crime"].includes(quest.questType);
  const rewardMultiplier =
    userData && missionOrCrime && userData.dailyMissions > MISSIONS_PER_DAY
      ? ADDITIONAL_MISSION_REWARD_MULTIPLIER
      : 1;
  const allDone = isQuestComplete(quest, tracker);
  const utils = api.useUtils();

  // Scene composition
  // - If not consecutive objectives, use background & scene from quest
  // - If consecutive objectives, use background & scene from active objective
  // - If no background or scene, use default background & scene from quest
  const activeObjective = getActiveObjective(quest, tracker);
  const assetIds: string[] = [];
  let shownText = quest.description;
  if (quest.consecutiveObjectives) {
    if (activeObjective?.sceneBackground) {
      assetIds.push(activeObjective.sceneBackground);
    } else if (quest.content.sceneBackground) {
      console.log("Using quest background");
      assetIds.push(quest.content.sceneBackground);
    }
    if (
      activeObjective?.sceneCharacters &&
      activeObjective.sceneCharacters.length > 0
    ) {
      assetIds.push(...activeObjective.sceneCharacters);
    } else {
      assetIds.push(...(quest.content.sceneCharacters || []));
    }
    if (activeObjective?.description) {
      shownText = activeObjective.description;
    }
  } else {
    if (quest.content.sceneBackground) {
      assetIds.push(quest.content.sceneBackground);
    }
    assetIds.push(...(quest.content.sceneCharacters || []));
  }

  // Query to fetch the assets
  const { data: gameAssets } = api.gameAsset.getSceneAssets.useQuery(
    { assetIds },
    { enabled: assetIds.length > 0 },
  );

  // Defaults for the scene
  const background =
    gameAssets?.filter((asset) => asset.type === "SCENE_BACKGROUND")?.[0]?.image ||
    IMG_SCENE_BACKGROUND;
  const characters =
    gameAssets
      ?.filter((asset) => asset.type === "SCENE_CHARACTER")
      .map((asset) => asset.image) || [];

  // Mutations
  const { checkRewards, isCheckingRewards } = useCheckRewards();
  const { mutate: abandon } = api.quests.abandon.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await utils.quests.allianceBuilding.invalidate();
      await utils.profile.getUser.invalidate();
    },
  });

  useEffect(() => {
    const check = quest.questType === "achievement" && !userQuest.completed;
    if (check && allDone && userData?.status === "AWAKE") {
      void checkRewards({ questId: quest.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData, userQuest, quest, allDone]);

  return (
    <Post
      className={`${tierOrDaily ? "" : "col-span-2"} ${showScene ? "px-0 py-0" : "px-3"}`}
      options={
        <div className="ml-3">
          <div className="mt-2 flex flex-row items-center ">
            {["mission", "crime", "event", "errand"].includes(quest.questType) && (
              <Confirm2
                title="Confirm deleting quest"
                button={
                  <X className="ml-2 h-6 w-6 hover:text-orange-500 cursor-pointer" />
                }
                onAccept={(e) => {
                  e.preventDefault();
                  void abandon({ id: quest.id });
                }}
              >
                Are you sure you want to abandon this quest? Note that even though you
                abandon this quest, you have still used one of your daily attempts.
              </Confirm2>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full gap-3">
        {!hideTitle && (
          <div className={cn(showScene ? "px-3 pt-3" : "")}>
            <div className={"font-bold text-xl"}>
              Current {capitalizeFirstLetter(quest.questType)}
            </div>
            <div className="font-bold text-sm">{quest.name}</div>
          </div>
        )}
        {/* If we're not showing the scene, just show the text. Usefull when we're in the logbook */}
        {!showScene && (
          <>
            <div className="pt-2">
              <Reward
                info={userQuest.quest.content.reward}
                rewardMultiplier={rewardMultiplier}
              />
              <EventTimer quest={quest} tracker={tracker} />
            </div>
            {!["tier", "daily"].includes(quest.questType) && quest.description && (
              <div>{parseHtml(quest.description)}</div>
            )}
          </>
        )}
        {showScene && (
          <div className="relative w-full aspect-3/2 overflow-hidden">
            <Image
              src={background}
              alt="SceneBackground"
              className="w-full relative rounded-lg"
              width={512}
              height={341}
            />
            {characters.map((character, i) => (
              <div key={i} className="absolute bottom-0 w-2/5">
                <Image
                  src={character}
                  alt="Character"
                  className="aspect-3 "
                  width={341}
                  height={512}
                />
              </div>
            ))}
            {/* Bottom dialog area */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pointer-events-none max-h-1/3">
              {/* Shown text */}
              <div className="bg-poppopover w-full max-w-[calc(100%-2rem)] max-h-1/3 min-h-10 p-2 rounded-lg overflow-y-auto border-2 mb-2 pointer-events-auto">
                {shownText}
              </div>

              {/* Dialog options */}
              {activeObjective?.task === "dialog" && (
                <div className="flex flex-row flex-wrap justify-end gap-2 w-full max-w-[calc(100%-2rem)] pr-4 pb-1 pointer-events-auto">
                  {activeObjective.nextObjectiveId.map((entry) => (
                    <div key={entry.nextObjectiveId}>
                      <div
                        className="bg-popover px-3 py-1 border-2 rounded-lg hover:bg-poppopover cursor-pointer whitespace-nowrap"
                        onClick={() =>
                          !isCheckingRewards &&
                          checkRewards({
                            questId: quest.id,
                            nextObjectiveId: entry.nextObjectiveId,
                          })
                        }
                      >
                        {isCheckingRewards ? (
                          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                        ) : (
                          entry.text
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            tierOrDaily ? "sm:grid-cols-1" : "sm:grid-cols-2",
            showScene ? "px-3 pb-3" : "",
          )}
        >
          {quest.content.objectives?.map((objective, i) => {
            // Clean up the shown objectives a bit to hide dialog
            const status = tracker?.goals.find((g) => g.id === objective.id);
            const hideIfNoRewards =
              objective.task === "dialog" ||
              (activeObjective && objective.id !== activeObjective?.id) ||
              (allDone && !status?.done);
            return (
              <Objective
                objective={objective}
                tracker={tracker}
                checkRewards={() => checkRewards({ questId: quest.id })}
                key={i}
                titlePrefix={quest.consecutiveObjectives ? "Objective: " : `${i + 1}. `}
                grayedOut={!isQuestObjectiveAvailable(quest, tracker, i)}
                hideIfNoRewards={hideIfNoRewards}
              />
            );
          })}
        </div>
        {allDone && userData?.status === "AWAKE" && (
          <div className={cn("grow w-full", showScene ? "p-3" : "")}>
            <Button
              id="return"
              onClick={() => checkRewards({ questId: quest.id })}
              className="w-full"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Collect Reward
            </Button>
          </div>
        )}
      </div>
    </Post>
  );
};

/**
 * Hook for checking rewards.
 * @returns The checkRewards mutation.
 */
export const useCheckRewards = () => {
  const utils = api.useUtils();

  // Mutations
  const { mutate: checkRewards, isPending: isCheckingRewards } =
    api.quests.checkRewards.useMutation({
      onSuccess: async (data) => {
        // If a failutre, show a toast
        if (!data.success && "message" in data) {
          showMutationToast({ success: data.success, message: data.message });
        }
        // If there is a userQuest, show the rewards
        if ("userQuest" in data && data.userQuest) {
          const { notifications, rewards, userQuest, resolved, badges } = data;
          const quest = userQuest.quest;
          const showToast =
            notifications.length > 0 ||
            (resolved && quest.successDescription) ||
            rewards.reward_money > 0 ||
            rewards.reward_clanpoints > 0 ||
            rewards.reward_exp > 0 ||
            rewards.reward_tokens > 0 ||
            rewards.reward_prestige > 0 ||
            rewards.reward_jutsus.length > 0 ||
            rewards.reward_badges.length > 0 ||
            rewards.reward_bloodlines.length > 0 ||
            rewards.reward_items.length > 0;
          const reward = (
            <div className="flex flex-col gap-2">
              {notifications.length > 0 && (
                <div className="flex flex-col gap-2">
                  {notifications.map((description, i) => (
                    <div key={`objective-success-${i}`}>
                      <b>Objective {i + 1}:</b>
                      <br />
                      <i>{parseHtml(description)}</i>
                    </div>
                  ))}
                </div>
              )}
              {resolved && quest.successDescription && (
                <div>
                  <b>Quest Completed:</b>
                  <br />
                  <i>{parseHtml(quest.successDescription)}</i>
                </div>
              )}
              <div className="flex flex-row items-center">
                <div className="flex flex-col basis-2/3">
                  {rewards.reward_money > 0 && (
                    <span>
                      <b>Money:</b> {rewards.reward_money} ryo
                    </span>
                  )}
                  {rewards.reward_clanpoints > 0 && (
                    <span>
                      <b>Clan points:</b> {rewards.reward_clanpoints}
                    </span>
                  )}
                  {rewards.reward_exp > 0 && (
                    <span>
                      <b>Experience:</b> {rewards.reward_exp}
                    </span>
                  )}
                  {rewards.reward_tokens > 0 && (
                    <span>
                      <b>Village tokens:</b> {rewards.reward_tokens}
                    </span>
                  )}
                  {rewards.reward_prestige > 0 && (
                    <span>
                      <b>Village prestige:</b> {rewards.reward_prestige}
                    </span>
                  )}
                  {rewards.reward_jutsus.length > 0 && (
                    <span>
                      <b>Jutsus: </b> {rewards.reward_jutsus.join(", ")}
                    </span>
                  )}
                  {rewards.reward_badges.length > 0 && (
                    <span>
                      <b>Badges: </b> {rewards.reward_badges.join(", ")}
                    </span>
                  )}
                  {rewards.reward_bloodlines.length > 0 && (
                    <span>
                      <b>Swappable Bloodlines: </b>{" "}
                      {rewards.reward_bloodlines.join(", ")}
                    </span>
                  )}
                  {rewards.reward_items.length > 0 && (
                    <span>
                      <b>Items: </b>
                      {rewards.reward_items.join(", ")}
                    </span>
                  )}
                </div>
                <div className="basis-1/3 flex flex-col">
                  {badges.map((badge, i) => (
                    <Image
                      key={i}
                      src={badge.image}
                      width={128}
                      height={128}
                      alt={badge.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
          if (resolved) {
            showMutationToast({
              success: true,
              message: reward,
              title: `Finished: ${quest.name}`,
            });
          } else if (showToast) {
            showMutationToast({
              success: true,
              message: reward,
              title: `Reward from ${quest.name}`,
            });
          }
          await Promise.all([
            utils.profile.getUser.invalidate(),
            utils.quests.getQuestHistory.invalidate(),
            utils.quests.allianceBuilding.invalidate(),
            utils.quests.missionHall.invalidate(),
            utils.quests.storyQuests.invalidate(),
          ]);
        }
      },
    });

  return { checkRewards, isCheckingRewards };
};
