import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "../../../../layout/ContentBox";
import Loader from "../../../../layout/Loader";
import { EditContent } from "../../../../layout/EditContent";
import { TagFormWrapper } from "../../../../layout/EditContent";
import { DocumentPlusIcon } from "@heroicons/react/24/outline";
import { DocumentMinusIcon } from "@heroicons/react/24/outline";
import { api } from "../../../../utils/api";
import { useRequiredUserData } from "../../../../utils/UserContext";
import { LetterRanks } from "../../../../../drizzle/constants";
import { setNullsToEmptyStrings } from "../../../../../src/utils/typeutils";
import { DamageTag } from "../../../../libs/combat/types";
import { BloodlineValidator } from "../../../../libs/combat/types";
import { show_toast, show_errors } from "../../../../libs/toast";
import { canChangeContent } from "../../../../utils/permissions";
import { bloodlineTypes } from "../../../../libs/combat/types";
import type { ZodBloodlineType } from "../../../../libs/combat/types";
import type { ZodAllTags } from "../../../../libs/combat/types";
import type { FormEntry } from "../../../../layout/EditContent";
import type { NextPage } from "next";

const BloodlinePanel: NextPage = () => {
  const router = useRouter();
  const bloodlineId = router.query.bloodlineid as string;
  const { data: userData } = useRequiredUserData();
  const [effects, setEffects] = useState<ZodAllTags[]>([]);

  // Queries
  const { data, isLoading, refetch } = api.bloodline.get.useQuery(
    { id: bloodlineId },
    {
      staleTime: Infinity,
      retry: false,
      enabled: bloodlineId !== undefined,
    }
  );

  // Convert key null values to empty strings, preparing data for form
  setNullsToEmptyStrings(data);

  const { data: villages, isLoading: load1 } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { mutate: updateBloodline, isLoading: load2 } =
    api.bloodline.update.useMutation({
      onSuccess: async (data) => {
        await refetch();
        show_toast("Updated Bloodline", data.message, "info");
      },
      onError: (error) => {
        show_toast("Error updating", error.message, "error");
      },
    });

  // Total loading state for all queries
  const totalLoading = isLoading || load1 || load2;

  // Redirect to profile if not content or admin
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      void router.push("/profile");
    }
    if (data) {
      setEffects(data.effects);
    }
  }, [userData, router, data]);

  // Form handling
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<ZodBloodlineType>({
    mode: "all",
    criteriaMode: "all",
    values: data,
    defaultValues: data,
    resolver: zodResolver(BloodlineValidator),
  });

  // Whenever effects are updated, update the value of the form state
  useEffect(() => {
    setValue("effects", effects, { shouldDirty: true });
  }, [effects, setValue]);

  // Form submission
  const handleBloodlineSubmit = handleSubmit(
    (data) => updateBloodline({ id: bloodlineId, data: { ...data, effects: effects } }),
    (errors) => show_errors(errors)
  );

  // Prevent unauthorized access
  if (totalLoading || !userData || !canChangeContent(userData.role)) {
    return <Loader explanation="Loading data" />;
  }

  // Watch for changes to avatar
  const imageUrl = watch("image");

  // Object for form values
  const formData: FormEntry<keyof ZodBloodlineType>[] = [
    { id: "name", label: "Bloodline Name", type: "text" },
    { id: "image", label: "Image", type: "avatar", href: imageUrl },
    { id: "description", label: "Description", type: "text" },
    { id: "regenIncrease", type: "number" },
    { id: "hidden", type: "number", label: "Hidden [hide AI bloodline]" },
    { id: "village", label: "Village", type: "db_values", values: villages },
    { id: "rank", type: "str_array", values: LetterRanks },
  ];

  // Icon for adding tag
  const AddTagIcon = (
    <DocumentPlusIcon
      className="h-6 w-6 cursor-pointer hover:fill-orange-500"
      onClick={() => {
        setEffects([...effects, DamageTag.parse({ description: "placeholder" })]);
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
        {!data && <p>Could not find this bloodline</p>}
        {data && (
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
            <TagFormWrapper
              idx={i}
              tag={tag}
              availableTags={bloodlineTypes}
              hideRounds={true}
              setEffects={setEffects}
            />
          </ContentBox>
        );
      })}
    </>
  );
};

export default BloodlinePanel;
