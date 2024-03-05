import React, { useState, useEffect } from "react";
import Post from "./Post";
import Image from "next/image";
import Toggle from "@/components/control/Toggle";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { Objective, Reward, EventTimer } from "@/layout/Objective";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import ReactHtmlParser from "react-html-parser";
import type { QuestTrackerType } from "@/validators/objectives";
import type { UserQuest } from "@/drizzle/schema";
import type { ArrayElement } from "@/utils/typeutils";

interface LogbookProps {}

const Logbook: React.FC<LogbookProps> = () => {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showActive, setShowActive] = useState<boolean | undefined>(undefined);
  const { data: userData } = useRequiredUserData();
  const showState = showActive === null ? true : showActive;

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
      enabled: showActive !== undefined && !showActive,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const allHistory = history?.pages
    .map((page) => page.data)
    .flat()
    .map((e) => ({
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
        </div>
      ),
    }));

  type Entry = ArrayElement<typeof allHistory>;
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  const columns: ColumnDefinitionType<Entry, keyof Entry>[] = [
    { key: "image", header: "", type: "avatar" },
    { key: "questType", header: "Type", type: "string" },
    { key: "name", header: "Title", type: "string" },
    { key: "info", header: "Info", type: "jsx" },
  ];

  return (
    <ContentBox
      title="LogBook"
      subtitle="Current & past activities for your character"
      initialBreak={true}
      padding={showState}
      topRightContent={
        <Toggle
          id="logbook-toggle"
          value={showActive}
          setShowActive={setShowActive}
          labelActive="Active"
          labelInactive="History"
        />
      }
    >
      {showState && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {userData?.userQuests?.map((uq, i) => {
            const tracker = userData?.questData?.find((q) => q.id === uq.questId);
            return tracker && <LogbookEntry key={i} userQuest={uq} tracker={tracker} />;
          })}
        </div>
      )}
      {!showState && isPending && <Loader explanation="Loading history..." />}
      {!showState && !isPending && (
        <Table data={allHistory} columns={columns} setLastElement={setLastElement} />
      )}
    </ContentBox>
  );
};

export default Logbook;

interface LogbookEntryProps {
  userQuest: UserQuest;
  tracker: QuestTrackerType;
}

export const LogbookEntry: React.FC<LogbookEntryProps> = (props) => {
  const { userQuest, tracker } = props;
  const quest = userQuest.quest;
  const tierOrDaily = ["tier", "daily"].includes(quest.questType);
  const allDone = tracker?.goals.every((g) => g.done);
  const utils = api.useContext();

  // Mutations
  const { mutate: checkRewards } = api.quests.checkRewards.useMutation({
    onSuccess: async ({ rewards, userQuest, resolved, badges }) => {
      if (userQuest) {
        const quest = userQuest.quest;
        const reward = (
          <div className="flex flex-col">
            {resolved && quest.successDescription && (
              <span className="mb-2">
                <i>{ReactHtmlParser(quest.successDescription)}</i>
              </span>
            )}
            <div className="flex flex-row items-center">
              <div className="flex flex-col basis-2/3">
                {rewards.reward_money > 0 && (
                  <span>
                    <b>Money:</b> {rewards.reward_money} ryo
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
      await utils.profile.getUser.invalidate();
    },
  });

  useEffect(() => {
    const check = quest.questType === "achievement" && !userQuest.completed;
    if (check && allDone) {
      void checkRewards({ questId: quest.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  <X className="ml-2 h-6 w-6 hover:fill-orange-500 cursor-pointer" />
                }
                onAccept={(e) => {
                  e.preventDefault();
                  void abandon({ id: quest.id });
                }}
              >
                Are you sure you want to abandon this quest? Note that if you abandon
                the quest, there will be a 10-minute timeout during which you cannot
                start a new quest.
              </Confirm>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        <div className="font-bold text-xl">
          Current {capitalizeFirstLetter(quest.questType)}
        </div>
        <div className="font-bold text-sm">{quest.name}</div>
        <div className="pt-2">
          <Reward info={quest.content.reward} />
          <EventTimer quest={quest} tracker={tracker} />
        </div>
        {!["tier", "daily"].includes(quest.questType) && quest.description && (
          <div>{ReactHtmlParser(quest.description)}</div>
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
            />
          ))}
        </div>
        <div className="grow" />
        {allDone && (
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
