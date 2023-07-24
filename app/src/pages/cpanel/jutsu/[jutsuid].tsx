import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { EditContent } from "../../../layout/EditContent";
import { TagFormWrapper } from "../../../layout/EditContent";
import { DocumentPlusIcon } from "@heroicons/react/24/outline";
import { DocumentMinusIcon } from "@heroicons/react/24/outline";
import { api } from "../../../utils/api";
import { useRequiredUserData } from "../../../utils/UserContext";
import { AttackTargets } from "../../../../drizzle/constants";
import { AttackMethods } from "../../../../drizzle/constants";
import { LetterRanks } from "../../../../drizzle/constants";
import { WeaponTypes } from "../../../../drizzle/constants";
import { JutsuTypes } from "../../../../drizzle/constants";
import { UserRanks } from "../../../../drizzle/constants";
import { setNullsToEmptyStrings } from "../../../../src/utils/typeutils";
import { DamageTag } from "../../../libs/combat/types";
import { JutsuValidator } from "../../../libs/combat/types";
import { show_toast } from "../../../libs/toast";
import { canChangeContent } from "../../../utils/permissions";
import type { ZodJutsuType } from "../../../libs/combat/types";
import type { ZodAllTags } from "../../../libs/combat/types";
import type { FormEntry } from "../../../layout/EditContent";
import type { NextPage } from "next";

const JutsuPanel: NextPage = () => {
  const router = useRouter();
  const jutsuId = router.query.jutsuid as string;
  const { data: userData } = useRequiredUserData();
  const [effects, setEffects] = useState<ZodAllTags[]>([]);

  // Queries
  const { data, isLoading, refetch } = api.jutsu.get.useQuery(
    { id: jutsuId },
    { staleTime: Infinity, enabled: jutsuId !== undefined }
  );

  // Convert key null values to empty strings, preparing data for form
  setNullsToEmptyStrings(data);

  const { data: bloodlines, isLoading: load1 } = api.bloodline.getAllNames.useQuery(
    undefined,
    { staleTime: Infinity }
  );

  const { data: villages, isLoading: load2 } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { mutate: updateJutsu } = api.jutsu.update.useMutation({
    onSuccess: async (data) => {
      await refetch();
      show_toast("Updated Jutsu", data.message, "info");
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
  } = useForm<ZodJutsuType>({
    values: data,
    defaultValues: data,
    resolver: zodResolver(JutsuValidator),
  });

  // Whenever effects are updated, update the value of the form state
  useEffect(() => {
    setValue("effects", effects, { shouldDirty: true });
  }, [effects, setValue]);

  // Form submission
  const handleJutsuSubmit = handleSubmit(
    (data) => updateJutsu({ id: jutsuId, data: { ...data, effects: effects } }),
    (errors) => console.log(errors)
  );

  // Prevent unauthorized access
  if (totalLoading || !userData || !canChangeContent(userData.role)) {
    return <Loader explanation="Loading data" />;
  }

  // Watch for changes to avatar
  const imageUrl = watch("image");

  // Object for form values
  const formData: FormEntry<keyof ZodJutsuType>[] = [
    { id: "name", label: "Jutsu Name", type: "text" },
    { id: "image", label: "Image", type: "avatar", href: imageUrl },
    { id: "description", label: "Description", type: "text" },
    { id: "battleDescription", label: "Battle Description", type: "text" },
    { id: "range", label: "Range [hexagons]", type: "number" },
    { id: "cooldown", label: "Cooldown [seconds]", type: "number" },
    { id: "actionCostPerc", label: "Action Cost [%]", type: "number" },
    { id: "staminaCostPerc", label: "Stamina Cost [%]", type: "number" },
    { id: "chakraCostPerc", label: "Chakra Cost [%]", type: "number" },
    { id: "healthCostPerc", label: "Health Cost [%]", type: "number" },
    { id: "jutsuType", type: "str_array", values: JutsuTypes },
    { id: "bloodlineId", label: "Bloodline", type: "db_values", values: bloodlines },
    { id: "villageId", label: "Village", type: "db_values", values: villages },
    { id: "jutsuWeapon", type: "str_array", values: WeaponTypes },
    { id: "method", type: "str_array", values: AttackMethods },
    { id: "jutsuRank", type: "str_array", values: LetterRanks },
    { id: "requiredRank", type: "str_array", values: UserRanks },
    { id: "target", type: "str_array", values: AttackTargets },
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
      <ContentBox title="Content Panel" subtitle="Jutsu Management">
        {!data && <p>Could not find this jutsu</p>}
        {data && (
          <EditContent
            schema={JutsuValidator._def.schema}
            showSubmit={isDirty}
            buttonTxt="Save to Database"
            setValue={setValue}
            register={register}
            errors={errors}
            formData={formData}
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
            key={i}
            title={`Jutsu Tag #${i + 1}`}
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
            <TagFormWrapper idx={i} tag={tag} setEffects={setEffects} />
          </ContentBox>
        );
      })}
    </>
  );
};

export default JutsuPanel;
