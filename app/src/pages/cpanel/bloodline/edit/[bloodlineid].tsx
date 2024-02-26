import { useEffect } from "react";
import { useSafePush } from "@/utils/routing";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ChatInputField from "@/layout/ChatInputField";
import { api } from "@/utils/api";
import { DamageTag } from "@/libs/combat/types";
import { EditContent } from "@/layout/EditContent";
import { EffectFormWrapper } from "@/layout/EditContent";
import { FilePlus, FileMinus } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
import { BloodlineValidator } from "@/libs/combat/types";
import { canChangeContent } from "@/utils/permissions";
import { bloodlineTypes } from "@/libs/combat/types";
import { useBloodlineEditForm } from "@/libs/bloodline";
import { show_toast } from "@/libs/toast";
import { getTagSchema } from "@/libs/combat/types";
import type { ZodAllTags } from "@/libs/combat/types";
import type { Bloodline } from "@/drizzle/schema";
import type { NextPage } from "next";

const BloodlinePanel: NextPage = () => {
  const router = useSafePush();
  const bloodlineId = router.query.bloodlineid as string;
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isLoading, refetch } = api.bloodline.get.useQuery(
    { id: bloodlineId },
    { staleTime: Infinity, retry: false, enabled: bloodlineId !== undefined },
  );

  // Convert key null values to empty strings, preparing data for form
  setNullsToEmptyStrings(data);

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

  return <SingleEditBloodline bloodline={data} refetch={refetch} />;
};

export default BloodlinePanel;

interface SingleEditBloodlineProps {
  bloodline: Bloodline;
  refetch: () => void;
}

const SingleEditBloodline: React.FC<SingleEditBloodlineProps> = (props) => {
  // Form handling
  const {
    loading,
    bloodline,
    effects,
    form,
    formData,
    setEffects,
    handleBloodlineSubmit,
  } = useBloodlineEditForm(props.bloodline, props.refetch);

  // Icon for adding tag
  const AddTagIcon = (
    <FilePlus
      className="h-6 w-6 cursor-pointer hover:fill-orange-500"
      onClick={() => {
        setEffects([
          ...effects,
          DamageTag.parse({
            description: "placeholder",
            residualModifier: 0,
          }),
        ]);
      }}
    />
  );

  const { mutate: chatIdea, isLoading } = api.openai.createBloodline.useMutation({
    onSuccess: (data) => {
      show_toast("Updated Bloodline", `Based on response from AI`, "success");
      let key: keyof typeof data;
      for (key in data) {
        if (key === "effects") {
          const effects = data.effects
            .map((effect) => {
              const schema = getTagSchema(effect);
              const parsed = schema.safeParse({ type: effect });
              if (parsed.success) {
                return parsed.data;
              } else {
                return undefined;
              }
            })
            .filter((e) => e !== undefined) as ZodAllTags[];
          setEffects(effects);
        } else {
          form.setValue(key, data[key]);
        }
      }
    },
    onError: (error) => {
      show_toast("Error from ChatGPT", error.message, "error");
    },
  });

  // Show panel controls
  return (
    <>
      <ContentBox
        title="Content Panel"
        subtitle="Bloodline Management"
        back_href="/manual/bloodlines"
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
                chatIdea({ bloodlineId: bloodline.id, prompt: text });
              }}
            />
          ) : undefined
        }
      >
        {!bloodline && <p>Could not find this bloodline</p>}
        {!loading && bloodline && (
          <EditContent
            schema={BloodlineValidator}
            form={form}
            formData={formData}
            showSubmit={form.formState.isDirty}
            buttonTxt="Save to Database"
            type="bloodline"
            allowImageUpload={true}
            onAccept={handleBloodlineSubmit}
          />
        )}
      </ContentBox>

      {effects.length === 0 && (
        <ContentBox
          title={`Bloodline Tags`}
          initialBreak={true}
          topRightContent={<div className="flex flex-row">{AddTagIcon}</div>}
        >
          Please add effects to this bloodline
        </ContentBox>
      )}
      {effects.map((tag, i) => {
        return (
          <ContentBox
            key={i}
            title={`Bloodline Tag #${i + 1}`}
            subtitle="Control battle effects"
            initialBreak={true}
            topRightContent={
              <div className="flex flex-row">
                {AddTagIcon}
                <FileMinus
                  className="h-6 w-6 cursor-pointer hover:fill-orange-500"
                  onClick={() => {
                    const newEffects = [...effects];
                    newEffects.splice(i, 1);
                    setEffects(newEffects);
                  }}
                />
              </div>
            }
          >
            <EffectFormWrapper
              idx={i}
              type="bloodline"
              tag={tag}
              availableTags={bloodlineTypes}
              effects={effects}
              setEffects={setEffects}
            />
          </ContentBox>
        );
      })}
    </>
  );
};
