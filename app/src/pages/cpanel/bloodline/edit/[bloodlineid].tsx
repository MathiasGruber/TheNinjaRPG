import { useEffect } from "react";
import { useSafePush } from "@/utils/routing";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { DamageTag } from "@/libs/combat/types";
import { EditContent } from "@/layout/EditContent";
import { TagFormWrapper } from "@/layout/EditContent";
import { DocumentPlusIcon } from "@heroicons/react/24/outline";
import { DocumentMinusIcon } from "@heroicons/react/24/outline";
import { useRequiredUserData } from "@/utils/UserContext";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
import { BloodlineValidator } from "@/libs/combat/types";
import { canChangeContent } from "@/utils/permissions";
import { bloodlineTypes } from "@/libs/combat/types";
import { useBloodlineEditForm } from "@/libs/bloodline";
import type { Bloodline } from "@/drizzle/schema";
import type { NextPage } from "next";

const BloodlinePanel: NextPage = () => {
  const router = useSafePush();
  const bloodlineId = router.query.bloodlineid as string;
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isLoading, refetch } = api.bloodline.get.useQuery(
    { id: bloodlineId },
    { staleTime: Infinity, retry: false, enabled: bloodlineId !== undefined }
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
    bloodline,
    effects,
    form: {
      setValue,
      register,
      formState: { isDirty, errors },
    },
    formData,
    setEffects,
    handleBloodlineSubmit,
  } = useBloodlineEditForm(props.bloodline, props.refetch);

  // Icon for adding tag
  const AddTagIcon = (
    <DocumentPlusIcon
      className="h-6 w-6 cursor-pointer hover:fill-orange-500"
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
        subtitle="Bloodline Management"
        back_href="/manual/bloodlines"
      >
        {!bloodline && <p>Could not find this bloodline</p>}
        {bloodline && (
          <div className="grid grid-cols-1 md:grid-cols-2 items-center">
            <EditContent
              schema={BloodlineValidator}
              showSubmit={isDirty}
              buttonTxt="Save to Database"
              setValue={setValue}
              register={register}
              errors={errors}
              formData={formData}
              onAccept={handleBloodlineSubmit}
            />
          </div>
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
                <DocumentMinusIcon
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
            <div className="grid grid-cols-1 md:grid-cols-2 items-center">
              <TagFormWrapper
                idx={i}
                tag={tag}
                availableTags={bloodlineTypes}
                hideRounds={true}
                effects={effects}
                setEffects={setEffects}
              />
            </div>
          </ContentBox>
        );
      })}
    </>
  );
};
