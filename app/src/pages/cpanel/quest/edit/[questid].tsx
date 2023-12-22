import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ChatInputField from "@/layout/ChatInputField";
import { nanoid } from "nanoid";
import { api } from "@/utils/api";
import { useEffect } from "react";
import { useSafePush } from "@/utils/routing";
import { EditContent } from "@/layout/EditContent";
import { ObjectiveFormWrapper } from "@/layout/EditContent";
import { DocumentPlusIcon } from "@heroicons/react/24/outline";
import { DocumentMinusIcon } from "@heroicons/react/24/outline";
import { useRequiredUserData } from "@/utils/UserContext";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
import { canChangeContent } from "@/utils/permissions";
import { allObjectiveTasks } from "@/validators/objectives";
import { useQuestEditForm } from "@/libs/quest";
import { QuestValidator, ObjectiveReward } from "@/validators/objectives";
import { SimpleObjective } from "@/validators/objectives";
import { show_toast } from "@/libs/toast";
import { getObjectiveSchema } from "@/validators/objectives";
import type { AllObjectivesType } from "@/validators/objectives";
import type { Quest } from "@/drizzle/schema";
import type { NextPage } from "next";

const QuestPanel: NextPage = () => {
  const router = useSafePush();
  const questId = router.query.questid as string;
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isLoading, refetch } = api.quests.get.useQuery(
    { id: questId },
    { staleTime: Infinity, enabled: questId !== undefined }
  );

  // Redirect to profile if not content or admin
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      void router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // Prevent unauthorized access
  if (isLoading || !userData || !canChangeContent(userData.role) || !data) {
    return <Loader explanation="Loading data" />;
  }

  return <SingleEditQuest quest={data} refetch={refetch} />;
};

export default QuestPanel;

interface SingleEditQuestProps {
  quest: Quest;
  refetch: () => void;
}

const SingleEditQuest: React.FC<SingleEditQuestProps> = (props) => {
  // Form handling
  const {
    quest,
    objectives,
    form: {
      control,
      getValues,
      setValue,
      register,
      formState: { isDirty, errors },
    },
    formData,
    setObjectives,
    handleQuestSubmit,
  } = useQuestEditForm(props.quest, props.refetch);

  const { mutate: chatIdea, isLoading } = api.openai.createQuest.useMutation({
    onSuccess: (data) => {
      show_toast("Updated Quest", `Based on response from AI`, "success");
      if ("description" in data && data.description) {
        setValue("description", data.description);
      }
      if ("successDescription" in data && data.successDescription) {
        setValue("successDescription", data.successDescription);
      }
      if ("title" in data && data.title) {
        setValue("name", data.title);
      }
      if ("objectives" in data && data.objectives) {
        const objectives = data.objectives
          .map((task) => {
            const schema = getObjectiveSchema(task);
            const parsed = schema.safeParse({ id: nanoid(), task: task });
            if (parsed.success) {
              return parsed.data;
            } else {
              return undefined;
            }
          })
          .filter((e) => e !== undefined) as AllObjectivesType[];
        setObjectives(objectives);
      }
    },
    onError: (error) => {
      show_toast("Error from ChatGPT", error.message, "error");
    },
  });

  // Icon for adding tag
  const AddObjectiveIcon = (
    <DocumentPlusIcon
      className="h-6 w-6 cursor-pointer hover:fill-orange-500"
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

  // Get current form values
  const currentValues = getValues();

  // Show panel controls
  return (
    <>
      <ContentBox
        title="Content Panel"
        subtitle="Quest Management"
        back_href="/manual/quests"
        noRightAlign={true}
        topRightContent={
          formData.find((e) => e.id === "description") ? (
            <ChatInputField
              id="chatInput"
              placeholder="Instruct ChatGPT to edit description & objectives"
              isLoading={isLoading}
              onSubmit={(text) => {
                chatIdea({ questId: quest.id, freeText: text });
              }}
            />
          ) : undefined
        }
      >
        {!quest && <p>Could not find this item</p>}
        {quest && (
          <div className="grid grid-cols-1 md:grid-cols-2 items-center">
            <EditContent
              currentValues={currentValues}
              schema={QuestValidator._def.schema.merge(ObjectiveReward)}
              showSubmit={isDirty}
              buttonTxt="Save to Database"
              setValue={setValue}
              register={register}
              errors={errors}
              formData={formData}
              control={control}
              type="quest"
              allowImageUpload={true}
              onAccept={handleQuestSubmit}
            />
          </div>
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
            key={i}
            title={`Quest Objective #${i + 1}`}
            subtitle="Control battle effects"
            initialBreak={true}
            topRightContent={
              <div className="flex flex-row">
                {AddObjectiveIcon}
                <DocumentMinusIcon
                  className="h-6 w-6 cursor-pointer hover:fill-orange-500"
                  onClick={() => {
                    const newObjectives = [...objectives];
                    newObjectives.splice(i, 1);
                    setObjectives(newObjectives);
                  }}
                />
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 items-center">
              <ObjectiveFormWrapper
                idx={i}
                objective={objective}
                availableTags={allObjectiveTasks}
                objectives={objectives}
                setObjectives={setObjectives}
              />
            </div>
          </ContentBox>
        );
      })}
    </>
  );
};
