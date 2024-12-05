"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ChatInputField from "@/layout/ChatInputField";
import { nanoid } from "nanoid";
import { api } from "@/app/_trpc/client";
import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { EditContent } from "@/layout/EditContent";
import { ObjectiveFormWrapper } from "@/layout/EditContent";
import { FilePlus, FileMinus } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import { allObjectiveTasks } from "@/validators/objectives";
import { useQuestEditForm } from "@/hooks/quest";
import { QuestValidator, ObjectiveReward } from "@/validators/objectives";
import { SimpleObjective } from "@/validators/objectives";
import { getObjectiveSchema } from "@/validators/objectives";
import type { ZodQuestType } from "@/validators/objectives";
import type { Quest } from "@/drizzle/schema";

export default function ManualBloodlineEdit(
  props: {
    params: Promise<{ questid: string }>;
  }
) {
  const params = use(props.params);
  // Setup
  const questId = params.questid;
  const router = useRouter();
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isPending, refetch } = api.quests.get.useQuery(
    { id: questId },
    { enabled: !!questId },
  );

  // Redirect to profile if not content or admin
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      void router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // Prevent unauthorized access
  if (isPending || !userData || !canChangeContent(userData.role) || !data) {
    return <Loader explanation="Loading data" />;
  }

  return <SingleEditQuest quest={data} refetch={refetch} />;
}

interface SingleEditQuestProps {
  quest: Quest;
  refetch: () => void;
}

const SingleEditQuest: React.FC<SingleEditQuestProps> = (props) => {
  // Form handling
  const { quest, objectives, form, formData, setObjectives, handleQuestSubmit } =
    useQuestEditForm(props.quest, props.refetch);

  // Icon for adding tag
  const AddObjectiveIcon = (
    <FilePlus
      className="h-6 w-6 cursor-pointer hover:text-orange-500"
      onClick={() => {
        setObjectives([
          ...objectives,
          SimpleObjective.parse({
            id: nanoid(),
            task: "pvp_kills",
            value: 10,
            reward: {},
          }),
        ]);
      }}
    />
  );

  // Show panel controls
  return (
    <>
      <ContentBox
        title="Content Panel"
        subtitle="Quest Management"
        back_href="/manual/quest"
        noRightAlign={true}
        topRightContent={
          formData.find((e) => e.id === "description") ? (
            <ChatInputField
              inputProps={{
                id: "chatInput",
                placeholder: "Instruct ChatGPT to edit",
              }}
              aiProps={{
                apiEndpoint: "/api/chat/quest",
                systemMessage: `
                  Current quest data: ${JSON.stringify(form.getValues())}. 
                  Current objectives: ${JSON.stringify(objectives)}
                `,
              }}
              onToolCall={(toolCall) => {
                const data = toolCall.args as ZodQuestType;
                let key: keyof typeof data;
                for (key in data) {
                  if (
                    [
                      "requiredVillage",
                      "reward_items",
                      "reward_jutsus",
                      "reward_badges",
                      "reward_rank",
                      "attackers",
                      "image",
                    ].includes(key)
                  ) {
                    continue;
                  } else if (key === "content") {
                    const newObjectives = data.content?.objectives
                      ?.map((objective) => {
                        const schema = getObjectiveSchema(objective.task);
                        const {
                          reward_items, // eslint-disable-line @typescript-eslint/no-unused-vars
                          reward_jutsus, // eslint-disable-line @typescript-eslint/no-unused-vars
                          reward_badges, // eslint-disable-line @typescript-eslint/no-unused-vars
                          reward_rank, // eslint-disable-line @typescript-eslint/no-unused-vars
                          attackers, // eslint-disable-line @typescript-eslint/no-unused-vars
                          ...rest
                        } = objective;
                        const parsed = schema.safeParse({ ...rest, id: nanoid() });
                        if (parsed.success) {
                          return parsed.data;
                        } else {
                          return undefined;
                        }
                      })
                      .filter((e) => e !== undefined);
                    setObjectives(newObjectives);
                  } else {
                    form.setValue(key, data[key], { shouldDirty: true });
                  }
                }
                void form.trigger();
              }}
            />
          ) : undefined
        }
      >
        {!quest && <p>Could not find this item</p>}
        {quest && (
          <EditContent
            schema={QuestValidator._def.schema.merge(ObjectiveReward)}
            form={form}
            formData={formData}
            showSubmit={form.formState.isDirty}
            buttonTxt="Save to Database"
            type="quest"
            allowImageUpload={true}
            onAccept={handleQuestSubmit}
          />
        )}
      </ContentBox>

      {objectives?.length === 0 && (
        <ContentBox
          title={`Quest Objective`}
          initialBreak={true}
          topRightContent={<div className="flex flex-row">{AddObjectiveIcon}</div>}
        >
          Please add objectives to this quest
        </ContentBox>
      )}
      {objectives?.map((objective, i) => {
        return (
          <ContentBox
            key={objective.id}
            title={`Quest Objective #${i + 1}`}
            subtitle="Control battle effects"
            initialBreak={true}
            topRightContent={
              <div className="flex flex-row">
                {AddObjectiveIcon}
                <FileMinus
                  className="h-6 w-6 cursor-pointer hover:text-orange-500"
                  onClick={() => {
                    const newObjectives = [...objectives];
                    newObjectives.splice(i, 1);
                    setObjectives(newObjectives);
                  }}
                />
              </div>
            }
          >
            <ObjectiveFormWrapper
              idx={i}
              objective={objective}
              availableTags={allObjectiveTasks}
              objectives={objectives}
              setObjectives={setObjectives}
            />
          </ContentBox>
        );
      })}
    </>
  );
};
