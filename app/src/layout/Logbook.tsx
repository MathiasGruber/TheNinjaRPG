import React, { useState } from "react";
import Post from "./Post";
import Toggle from "@/layout/Toggle";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Button from "@/layout/Button";
import Confirm from "@/layout/Confirm";
import { SparklesIcon } from "@heroicons/react/24/solid";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { Objective, Reward, EventTimer } from "@/layout/Objective";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import ReactHtmlParser from "react-html-parser";
import type { QuestTrackerType } from "@/validators/objectives";
import type { Quest } from "@/drizzle/schema";
import type { ArrayElement } from "@/utils/typeutils";

interface LogbookProps {}

const Logbook: React.FC<LogbookProps> = () => {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { data: userData } = useRequiredUserData();
  const [showActive, setShowActive] = useState<boolean>(true);

  // Queries
  const {
    data: history,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = api.quests.getQuestHistory.useInfiniteQuery(
    {
      limit: 10,
    },
    {
      enabled: !showActive,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
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
    { key: "image", header: "", type: "avatar", width: 7 },
    { key: "questType", header: "Type", type: "string" },
    { key: "name", header: "Title", type: "string" },
    { key: "info", header: "Info", type: "jsx" },
  ];

  return (
    <ContentBox
      title="LogBook"
      subtitle="Current & past activities for your character"
      initialBreak={true}
      padding={showActive}
      topRightContent={
        <Toggle
          value={showActive}
          setShowActive={setShowActive}
          labelActive="Active"
          labelInactive="History"
        />
      }
    >
      {showActive && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {userData?.userQuests.map((uq, i) => {
            const tracker = userData?.questData?.find((q) => q.id === uq.questId);
            return (
              tracker && <LogbookEntry key={i} quest={uq.quest} tracker={tracker} />
            );
          })}
        </div>
      )}
      {!showActive && isLoading && <Loader explanation="Loading history..." />}
      {!showActive && !isLoading && (
        <Table data={allHistory} columns={columns} setLastElement={setLastElement} />
      )}
    </ContentBox>
  );
};

export default Logbook;

interface LogbookEntryProps {
  quest: Quest;
  tracker: QuestTrackerType;
}

export const LogbookEntry: React.FC<LogbookEntryProps> = (props) => {
  const { quest, tracker } = props;
  const tierOrDaily = ["tier", "daily"].includes(quest.questType);
  const allDone = tracker?.goals.every((g) => g.done);
  const utils = api.useContext();

  // Mutations
  const { mutate: checkRewards } = api.quests.checkRewards.useMutation({
    onSuccess: async ({ rewards, quest }) => {
      if (quest) {
        const reward = (
          <div className="flex flex-col">
            {quest.successDescription && (
              <span className="mb-2">
                <i>{ReactHtmlParser(quest.successDescription)}</i>
              </span>
            )}
            {rewards.reward_money > 0 && (
              <span>
                <b>Money:</b> {rewards.reward_money} ryo
              </span>
            )}
            {rewards.reward_jutsus.length > 0 && (
              <span>
                <b>Jutsus: </b> {rewards.reward_jutsus.join(", ")}
              </span>
            )}
            {rewards.reward_items.length > 0 && (
              <span>
                <b>Items: </b>
                {rewards.reward_items.join(", ")}
              </span>
            )}
          </div>
        );
        show_toast(`Finished : ${quest.name}`, reward, "success");
        await utils.profile.getUser.invalidate();
        await utils.quests.getQuestHistory.invalidate();
      } else {
        show_toast("Info", "All objectives were not completed yet", "info");
      }
    },
    onError: (error) => {
      show_toast("Error checking rewards", error.message, "error");
    },
  });

  const { mutate: abandon } = api.quests.abandon.useMutation({
    onSuccess: async ({ message }) => {
      show_toast("Success", message, "success");
      await utils.profile.getUser.invalidate();
    },
    onError: (error) => {
      show_toast("Error abandoning", error.message, "error");
    },
  });

  return (
    <Post
      className={tierOrDaily ? "" : "col-span-2"}
      options={
        <div className="ml-3">
          <div className="mt-2 flex flex-row items-center ">
            {["mission", "crime", "event", "errand"].includes(quest.questType) && (
              <Confirm
                title="Confirm deleting quest"
                button={
                  <XMarkIcon className="ml-2 h-6 w-6 hover:fill-orange-500 cursor-pointer" />
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
            label={`Collect Reward`}
            image={<SparklesIcon className="h-6 w-6 mr-2" />}
            onClick={() => checkRewards({ questId: quest.id })}
          />
        )}
      </div>
    </Post>
  );
};
