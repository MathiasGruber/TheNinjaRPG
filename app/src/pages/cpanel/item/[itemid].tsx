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
import { WeaponTypes } from "../../../../drizzle/constants";
import { AttackTargets } from "../../../../drizzle/constants";
import { AttackMethods } from "../../../../drizzle/constants";
import { ItemTypes } from "../../../../drizzle/constants";
import { ItemRarities } from "../../../../drizzle/constants";
import { ItemSlotTypes } from "../../../../drizzle/constants";
import { setNullsToEmptyStrings } from "../../../../src/utils/typeutils";
import { DamageTag } from "../../../libs/combat/types";
import { ItemValidator } from "../../../libs/combat/types";
import { show_toast, show_errors } from "../../../libs/toast";
import { canChangeContent } from "../../../utils/permissions";
import { tagTypes } from "../../../libs/combat/types";
import type { ZodItemType } from "../../../libs/combat/types";
import type { ZodAllTags } from "../../../libs/combat/types";
import type { FormEntry } from "../../../layout/EditContent";
import type { NextPage } from "next";

const ItemPanel: NextPage = () => {
  const router = useRouter();
  const itemId = router.query.itemid as string;
  const { data: userData } = useRequiredUserData();
  const [effects, setEffects] = useState<ZodAllTags[]>([]);

  // Queries
  const { data, isLoading, refetch } = api.item.get.useQuery(
    { id: itemId },
    { staleTime: Infinity, enabled: itemId !== undefined }
  );

  // Convert key null values to empty strings, preparing data for form
  setNullsToEmptyStrings(data);

  const { mutate: updateItem } = api.item.update.useMutation({
    onSuccess: async (data) => {
      await refetch();
      show_toast("Updated Item", data.message, "info");
    },
    onError: (error) => {
      show_toast("Error updating", error.message, "error");
    },
  });

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
    setValue,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<ZodItemType>({
    values: data,
    defaultValues: data,
    resolver: zodResolver(ItemValidator),
  });

  // Whenever effects are updated, update the value of the form state
  useEffect(() => {
    setValue("effects", effects, { shouldDirty: true });
  }, [effects, setValue]);

  // Form submission
  const handleItemSubmit = handleSubmit(
    (data) => updateItem({ id: itemId, data: { ...data, effects: effects } }),
    (errors) => show_errors(errors)
  );

  // Prevent unauthorized access
  if (isLoading || !userData || !canChangeContent(userData.role)) {
    return <Loader explanation="Loading data" />;
  }

  // Watch for changes to avatar
  const imageUrl = watch("image");

  // Object for form values
  const formData: FormEntry<keyof ZodItemType>[] = [
    { id: "name", label: "Item Name", type: "text" },
    { id: "image", type: "avatar", href: imageUrl },
    { id: "description", type: "text" },
    { id: "battleDescription", type: "text" },
    { id: "itemType", type: "str_array", values: ItemTypes },
    { id: "rarity", type: "str_array", values: ItemRarities },
    { id: "slot", type: "str_array", values: ItemSlotTypes },
    { id: "weaponType", type: "str_array", values: WeaponTypes },
    { id: "target", type: "str_array", values: AttackTargets },
    { id: "method", type: "str_array", values: AttackMethods },
    { id: "cost", type: "number" },
    { id: "canStack", type: "number" },
    { id: "stackSize", type: "number" },
    { id: "destroyOnUse", type: "number" },
    { id: "range", type: "number" },
    { id: "chakraCostPerc", type: "number" },
    { id: "staminaCostPerc", type: "number" },
    { id: "actionCostPerc", type: "number" },
    { id: "healthCostPerc", type: "number" },
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
        subtitle="Item Management"
        back_href="/manual/items"
      >
        {!data && <p>Could not find this item</p>}
        {data && (
          <EditContent
            schema={ItemValidator._def.schema}
            showSubmit={isDirty}
            buttonTxt="Save to Database"
            setValue={setValue}
            register={register}
            errors={errors}
            formData={formData}
            onAccept={handleItemSubmit}
          />
        )}
      </ContentBox>

      {effects.length === 0 && (
        <ContentBox
          title={`Item Tags`}
          initialBreak={true}
          topRightContent={<div className="flex flex-row">{AddTagIcon}</div>}
        >
          Please add effects to this item
        </ContentBox>
      )}
      {effects.map((tag, i) => {
        return (
          <ContentBox
            key={i}
            title={`Item Tag #${i + 1}`}
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
              availableTags={tagTypes}
              setEffects={setEffects}
            />
          </ContentBox>
        );
      })}
    </>
  );
};

export default ItemPanel;
