"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ChatInputField from "@/layout/ChatInputField";
import { EditContent } from "@/layout/EditContent";
import { EffectFormWrapper } from "@/layout/EditContent";
import { FilePlus, FileMinus } from "lucide-react";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { DamageTag } from "@/libs/combat/types";
import { JutsuValidator } from "@/libs/combat/types";
import { canChangeContent } from "@/utils/permissions";
import { tagTypes } from "@/libs/combat/types";
import { useJutsuEditForm } from "@/libs/jutsu";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
import { getTagSchema } from "@/libs/combat/types";
import type { ZodJutsuType } from "@/libs/combat/types";
import type { Jutsu } from "@/drizzle/schema";

export default function JutsuEdit({ params }: { params: { jutsuid: string } }) {
  const jutsuId = params.jutsuid;

  // State
  const router = useRouter();
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isPending, refetch } = api.jutsu.get.useQuery(
    { id: jutsuId },
    { staleTime: Infinity, retry: false, enabled: jutsuId !== undefined },
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
  if (isPending || !userData || !canChangeContent(userData.role) || !data) {
    return <Loader explanation="Loading data" />;
  }

  return <SingleEditJutsu jutsu={data} refetch={refetch} />;
}

interface SingleEditJutsuProps {
  jutsu: Jutsu;
  refetch: () => void;
}

const SingleEditJutsu: React.FC<SingleEditJutsuProps> = (props) => {
  // Form handling
  const { loading, jutsu, effects, form, formData, setEffects, handleJutsuSubmit } =
    useJutsuEditForm(props.jutsu, props.refetch);

  // Icon for adding tag
  const AddTagIcon = (
    <FilePlus
      className="h-6 w-6 cursor-pointer hover:text-orange-500"
      onClick={() => {
        setEffects([
          ...effects,
          DamageTag.parse({
            description: "placeholder",
            rounds: 0,
            residualModifier: 0,
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
        subtitle="Jutsu Management"
        back_href="/manual/jutsu"
        topRightContent={
          formData.find((e) => e.id === "description") ? (
            <ChatInputField
              inputProps={{
                id: "chatInput",
                placeholder: "Instruct ChatGPT to edit",
              }}
              aiProps={{
                apiEndpoint: "/api/chat/jutsu",
                systemMessage: `
                  Current jutsu data: ${JSON.stringify(form.getValues())}. 
                  Current effects: ${JSON.stringify(effects)}
                `,
              }}
              onToolCall={(toolCall) => {
                const data = toolCall.args as ZodJutsuType;
                let key: keyof typeof data;
                for (key in data) {
                  if (["villageId", "image"].includes(key)) {
                    continue;
                  } else if (key === "effects") {
                    const newEffects = data.effects
                      .map((effect) => {
                        const schema = getTagSchema(effect.type);
                        const parsed = schema.safeParse(effect);
                        if (parsed.success) {
                          return parsed.data;
                        } else {
                          return undefined;
                        }
                      })
                      .filter((e) => e !== undefined);
                    setEffects(newEffects);
                  } else {
                    form.setValue(key, data[key]);
                  }
                }
                void form.trigger();
              }}
            />
          ) : undefined
        }
      >
        {!jutsu && <p>Could not find this jutsu</p>}
        {!loading && jutsu && (
          <EditContent
            schema={JutsuValidator._def.schema._def.schema}
            form={form}
            formData={formData}
            showSubmit={form.formState.isDirty}
            buttonTxt="Save to Database"
            type="jutsu"
            allowImageUpload={true}
            onAccept={handleJutsuSubmit}
          />
        )}
      </ContentBox>

      {effects.length === 0 && (
        <ContentBox
          title={`Jutsu Tags`}
          initialBreak={true}
          topRightContent={<div className="flex flex-row">{AddTagIcon}</div>}
        >
          Please add effects to this jutsu
        </ContentBox>
      )}
      {effects.map((tag, i) => {
        return (
          <ContentBox
            key={`${tag.type}-${i}`}
            title={`Jutsu Tag #${i + 1}`}
            subtitle="Control battle effects"
            initialBreak={true}
            topRightContent={
              <div className="flex flex-row">
                {AddTagIcon}
                <FileMinus
                  className="h-6 w-6 cursor-pointer hover:text-orange-500"
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
              type="jutsu"
              tag={tag}
              availableTags={tagTypes}
              effects={effects}
              setEffects={setEffects}
            />
          </ContentBox>
        );
      })}
    </>
  );
};
