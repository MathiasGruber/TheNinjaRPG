import React, { useState, useEffect } from "react";
import Post from "./Post";
import Image from "next/image";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import Accordion from "@/layout/Accordion";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { Objective, Reward, EventTimer } from "@/layout/Objective";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import { parseHtml } from "@/utils/parse";
import { isQuestObjectiveAvailable } from "@/libs/objectives";
import type { QuestTrackerType } from "@/validators/objectives";
import type { UserQuest } from "@/drizzle/schema";
import type { ArrayElement } from "@/utils/typeutils";

interface LogbookProps {}

const tabs = ["Active", "History", "Battles"] as const;
type tabType = (typeof tabs)[number];

const Logbook: React.FC<LogbookProps> = () => {
  // State
  const [tab, setTab] = useState<tabType | null>(null);

  return (
    <ContentBox
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
    </ContentBox>
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

  useEffect(() => {
    if (userData && !activeElement) {
      const firstUserQuest = userData.userQuests?.[0];
      if (firstUserQuest) {
        setActiveElement(firstUserQuest.quest.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  return (
    <div className="">
      {userData?.userQuests
        ?.filter((uq) => uq.quest.questType !== "achievement")
        .map((uq, i) => {
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
  const { data: history, isPending } = api.combat.getBattleHistory.useQuery(
    { secondsBack: 3600 * 3 },
    { staleTime: Infinity },
  );
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
      staleTime: Infinity,
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
  const { userQuest, tracker, hideTitle } = props;
  const quest = userQuest.quest;
  const tierOrDaily = ["tier", "daily"].includes(quest.questType);
  const allDone = tracker?.goals.every((g) => g.done);
  const utils = api.useUtils();

  // Mutations
  const { mutate: checkRewards } = api.quests.checkRewards.useMutation({
    onSuccess: async ({
      successDescriptions,
      rewards,
      userQuest,
      resolved,
      badges,
    }) => {
      if (userQuest) {
        const quest = userQuest.quest;
        const reward = (
          <div className="flex flex-col gap-2">
            {successDescriptions.length > 0 && (
              <div className="flex flex-col gap-2">
                {successDescriptions.map((description, i) => (
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
        } else {
          showMutationToast({
            success: true,
            message: reward,
            title: `Reward from ${quest.name}`,
          });
        }
        await utils.profile.getUser.invalidate();
        await utils.quests.getQuestHistory.invalidate();
      }
    },
  });

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

  // We do not show entries for achievements
  if (quest.questType === "achievement") return undefined;

  return (
    <Post
      className={`${tierOrDaily ? "" : "col-span-2"} px-3`}
      options={
        <div className="ml-3">
          <div className="mt-2 flex flex-row items-center ">
            {["mission", "crime", "event", "errand"].includes(quest.questType) && (
              <Confirm
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
              </Confirm>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {!hideTitle && (
          <>
            <div className="font-bold text-xl">
              Current {capitalizeFirstLetter(quest.questType)}
            </div>
            <div className="font-bold text-sm">{quest.name}</div>
          </>
        )}
        <div className="pt-2">
          <Reward info={quest.content.reward} />
          <EventTimer quest={quest} tracker={tracker} />
        </div>
        {!["tier", "daily"].includes(quest.questType) && quest.description && (
          <div>{parseHtml(quest.description)}</div>
        )}
        <div
          className={`grid grid-cols-1 sm:grid-cols-${
            tierOrDaily ? "1" : "2"
          } gap-4 pt-3`}
        >
          {quest.content.objectives?.map((objective, i) => (
            <Objective
              objective={objective}
              tracker={tracker}
              checkRewards={() => checkRewards({ questId: quest.id })}
              key={i}
              titlePrefix={`${i + 1}. `}
              grayedOut={!isQuestObjectiveAvailable(quest, tracker, i)}
            />
          ))}
        </div>
        <div className="grow" />
        {allDone && userData?.status === "AWAKE" && (
          <Button
            id="return"
            className="mt-3"
            onClick={() => checkRewards({ questId: quest.id })}
          >
            <Sparkles className="h-5 w-5 mr-2" />
            Collect Reward
          </Button>
        )}
      </div>
    </Post>
  );
};
