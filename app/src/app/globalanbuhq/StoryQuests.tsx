"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { LogbookEntry } from "@/layout/Logbook";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Gamepad2 } from "lucide-react";
import Accordion from "@/layout/Accordion";
import ItemWithEffects from "@/layout/ItemWithEffects";
import type { UserWithRelations } from "@/server/api/routers/profile";
import { useState, useEffect } from "react";

interface StoryQuestsProps {
  userData: UserWithRelations;
}

export default function StoryQuests({ userData }: StoryQuestsProps) {
  const util = api.useUtils();
  const [activeElement, setActiveElement] = useState<string>("");

  const currentQuest = userData?.userQuests?.find(
    (q) => q.quest?.questType === "story" && !q.endAt,
  );

  const { data: storyQuests } = api.quests.storyQuests.useQuery({
    level: userData?.level ?? 0,
  });

  const { mutate: startQuest, isPending } = api.quests.startQuest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await util.profile.getUser.invalidate();
    },
  });

  // Default active tab
  useEffect(() => {
    if (userData && !activeElement) {
      const currentQuest = userData?.userQuests?.find((uq) =>
        ["story"].includes(uq.quest.questType),
      );
      if (currentQuest) {
        setActiveElement(currentQuest.quest.name);
      }
    }
  }, [userData, activeElement]);

  if (!userData) return null;

  // Filter for story quests only
  const availableStoryQuests = storyQuests ?? [];

  return (
    <ContentBox
      title="Story Missions"
      subtitle="Global Anbu HQ"
      initialBreak={true}
      padding={false}
    >
      <p className="text-center text-xl font-bold mb-4 px-3 pt-3">
        Story missions are special assignments that advance the game&apos;s narrative.
        They can only be started here at the Global Anbu HQ.
      </p>
      {isPending && <Loader explanation="Starting quest..." />}
      {!isPending && (
        <div className="mt-3 bg-popover">
          {availableStoryQuests.length === 0 && (
            <p className="font-bold">No current story quests available</p>
          )}
          {availableStoryQuests.map((quest, i) => {
            const currentQuest = userData?.userQuests?.find(
              (uq) => uq.quest.id === quest.id && !uq.endAt,
            );
            const currentTracker = userData?.questData?.find((q) => q.id === quest.id);
            const active = currentQuest && currentTracker;

            return (
              <div key={i}>
                <Accordion
                  title={quest.name}
                  selectedTitle={activeElement}
                  titlePrefix={`${active ? "Active" : "Available"}: `}
                  onClick={setActiveElement}
                >
                  {active ? (
                    <div className="p-3">
                      <LogbookEntry
                        userQuest={currentQuest}
                        tracker={currentTracker}
                        hideTitle
                      />
                    </div>
                  ) : (
                    <ItemWithEffects
                      item={quest}
                      showEdit="quest"
                      imageExtra={
                        <Button
                          className="mt-2"
                          onClick={() =>
                            startQuest({
                              questId: quest.id,
                              userSector: userData.sector,
                            })
                          }
                        >
                          <Gamepad2 className="mr-1 h-6 w-6" />
                          Take Quest
                        </Button>
                      }
                      hideTitle
                    />
                  )}
                </Accordion>
              </div>
            );
          })}
        </div>
      )}
    </ContentBox>
  );
}
