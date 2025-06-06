"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import MassEditContent from "@/layout/MassEditContent";
import ItemWithEffects from "@/layout/ItemWithEffects";
import { Button } from "@/components/ui/button";
import { api } from "@/app/_trpc/client";
import { FilePlus, SquarePen } from "lucide-react";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import QuestFiltering, { useFiltering, getFilter } from "@/layout/QuestFiltering";

export default function ManualQuests() {
  // Settings
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Router for forwarding
  const router = useRouter();

  // Filtering
  const state = useFiltering();

  // Query data
  const {
    data: quests,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = api.quests.getAll.useInfiniteQuery(
    { limit: 10, ...getFilter(state) },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );
  const allQuests = quests?.pages
    .map((page) => page.data)
    .flat()
    .map((q) => ({ ...q, village: { name: q.village?.name ?? "Any" } }));
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isPending: load1 } = api.quests.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      router.push(`/manual/quest/edit/${data.message}`);
    },
  });

  const { mutate: remove, isPending: load2 } = api.quests.delete.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
    },
  });

  // Derived
  const totalLoading = isFetching || load1 || load2;

  // Return JSX
  return (
    <>
      <ContentBox
        title="Quests"
        subtitle="Tasks to perform around the world"
        back_href="/manual"
      >
        Quests covers a wide range of activities within the game, including:
        <ul>
          <li className="pt-3">
            <b>Tier Quests: </b> These are progressively unlocked. Each quest tier has 3
            objectives, with their own rewards, and once all objectives are completed,
            the user can progress to the next tier. These are the same for all users and
            are generated by the content team.
          </li>
          <li className="pt-3">
            <b>Daily Quests: </b> Each day a new daily quest is generated. Daily quests
            have 3 random objectives to be completed. These are the same for all users
            based on their rank, and are randomly selected from the database.
          </li>
          <li className="pt-3">
            <b>Errands:</b> Errands are simple assignments that can be picked up at the
            mission hall to earn some quick cash. Anyone can perform errands. Errands
            are generated on the fly by an AI.
          </li>
          <li className="pt-3">
            <b>Missions: </b> Missions are more complex assignments that can be picked
            up at the mission hall. Only Genin+ can perform missions. Missions are
            generated on the fly by an AI.
          </li>
          <li className="pt-3">
            <b>Crimes: </b> Crimes are more complex assignments assigned by the criminal
            syndicate. Only outlaws can perform crimes. Crimes are generated on the fly
            by an AI.
          </li>
          <li className="pt-3">
            <b>Events: </b> These are occational one-time quests created by the content
            team.
          </li>
          <li className="pt-3">
            <b>Exams: </b> The are special quests unlocked when reaching certain levels,
            allowing the user to advance to the next rank.
          </li>
        </ul>
      </ContentBox>
      <ContentBox
        title="Overview"
        subtitle={`${state.questType} quests`}
        initialBreak={true}
        topRightContent={
          <div className="flex flex-row gap-2">
            {userData && canChangeContent(userData.role) && (
              <div className="flex flex-row gap-2">
                <Button id="create-quest" onClick={() => create()}>
                  <FilePlus className="mr-1 h-6 w-6" />
                  New
                </Button>
                <MassEditContent
                  title="Mass Edit Quests"
                  type="quest"
                  button={
                    <Button id="create-quest">
                      <SquarePen className="mr-2 h-6 w-6" />
                      Edit
                    </Button>
                  }
                />
              </div>
            )}
            <QuestFiltering state={state} />
          </div>
        }
      >
        {totalLoading && <Loader explanation="Loading data" />}
        {allQuests?.map((quest, i) => (
          <div
            key={`${quest.id}-${i}`}
            ref={i === allQuests.length - 1 ? setLastElement : null}
          >
            <ItemWithEffects
              item={quest}
              key={quest.id}
              onDelete={(id: string) => remove({ id })}
              showEdit="quest"
              showCopy="quest"
            />
          </div>
        ))}
      </ContentBox>
    </>
  );
}
