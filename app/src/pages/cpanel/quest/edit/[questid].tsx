import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ChatInputField from "@/layout/ChatInputField";
import { nanoid } from "nanoid";
import { api } from "@/utils/api";
import { useEffect } from "react";
import { useSafePush } from "@/utils/routing";
import { EditContent } from "@/layout/EditContent";
import { ObjectiveFormWrapper } from "@/layout/EditContent";
import { FilePlus, FileMinus } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import { allObjectiveTasks } from "@/validators/objectives";
import { useQuestEditForm } from "@/libs/quest";
import { QuestValidator, ObjectiveReward } from "@/validators/objectives";
import { SimpleObjective } from "@/validators/objectives";
import { showMutationToast } from "@/libs/toast";
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
    { staleTime: Infinity, enabled: questId !== undefined },
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
  const { quest, objectives, form, formData, setObjectives, handleQuestSubmit } =
    useQuestEditForm(props.quest, props.refetch);

  const { mutate: chatIdea, isLoading } = api.openai.createQuest.useMutation({
    onSuccess: (data) => {
      showMutationToast({ success: true, message: "AI Updated Quest" });
      let key: keyof typeof data;
      for (key in data) {
        if (key === "objectives") {
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
        } else {
          form.setValue(key, data[key]);
        }
      }
    },
  });

  // Icon for adding tag
  const AddObjectiveIcon = (
    <FilePlus
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
              inputProps={{
                id: "chatInput",
                placeholder: "Instruct ChatGPT to edit",
                disabled: isLoading,
              }}
              onChat={(text) => {
                chatIdea({ questId: quest.id, prompt: text });
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
            key={i}
            title={`Quest Objective #${i + 1}`}
            subtitle="Control battle effects"
            initialBreak={true}
            topRightContent={
              <div className="flex flex-row">
                {AddObjectiveIcon}
                <FileMinus
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
