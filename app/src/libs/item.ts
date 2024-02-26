import HumanDiff from "human-object-diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ItemValidator } from "@/libs/combat/types";
import { WeaponTypes } from "@/drizzle/constants";
import { AttackTargets } from "@/drizzle/constants";
import { AttackMethods } from "@/drizzle/constants";
import { ItemTypes } from "@/drizzle/constants";
import { ItemRarities } from "@/drizzle/constants";
import { ItemSlotTypes } from "@/drizzle/constants";
import { api } from "@/utils/api";
import { show_toast, show_errors } from "@/libs/toast";
import type { Item } from "@/drizzle/schema";
import type { ZodAllTags } from "@/libs/combat/types";
import type { FormEntry } from "@/layout/EditContent";
import type { ZodItemType } from "@/libs/combat/types";

/**
 * Hook used when creating frontend forms for editing items
 * @param data
 */
export const useItemEditForm = (data: Item, refetch: () => void) => {
  // Case type
  const item = { ...data, effects: data.effects };

  // Form handling
  const form = useForm<ZodItemType>({
    mode: "all",
    criteriaMode: "all",
    values: item,
    defaultValues: item,
    resolver: zodResolver(ItemValidator),
  });

  // Mutation for updating item
  const { mutate: updateItem } = api.item.update.useMutation({
    onSuccess: (data) => {
      refetch();
      show_toast("Updated Item", data.message, "info");
    },
    onError: (error) => {
      show_toast("Error updating", error.message, "error");
    },
  });

  // Form submission
  const handleItemSubmit = form.handleSubmit(
    (data: ZodItemType) => {
      const newItem = { ...item, ...data };
      const diff = new HumanDiff({}).diff(item, newItem);
      if (diff.length > 0) {
        updateItem({ id: item.id, data: newItem });
      }
    },
    (errors) => show_errors(errors),
  );

  // Watch the effects
  const effects = form.watch("effects");

  // Handle updating of effects
  const setEffects = (newEffects: ZodAllTags[]) => {
    form.setValue("effects", newEffects, { shouldDirty: true });
  };

  // Watch for changes to avatar
  const imageUrl = form.watch("image");

  // Object for form values
  const formData: FormEntry<keyof ZodItemType>[] = [
    { id: "name", label: "Item Name", type: "text" },
    { id: "image", type: "avatar", href: imageUrl },
    { id: "itemType", type: "str_array", values: ItemTypes },
    { id: "rarity", type: "str_array", values: ItemRarities },
    { id: "slot", type: "str_array", values: ItemSlotTypes },
    { id: "weaponType", type: "str_array", values: WeaponTypes },
    { id: "description", type: "text", doubleWidth: true },
    { id: "battleDescription", type: "text", doubleWidth: true },
    { id: "target", type: "str_array", values: AttackTargets },
    { id: "method", type: "str_array", values: AttackMethods },
    { id: "cost", type: "number" },
    { id: "cooldown", label: "cooldown", type: "number" },
    { id: "canStack", type: "number" },
    { id: "stackSize", type: "number" },
    { id: "destroyOnUse", type: "number" },
    { id: "range", type: "number" },
    { id: "chakraCostPerc", type: "number" },
    { id: "staminaCostPerc", type: "number" },
    { id: "actionCostPerc", type: "number" },
    { id: "healthCostPerc", type: "number" },
    { id: "hidden", type: "number", label: "Hidden" },
  ];

  return { item, effects, form, formData, setEffects, handleItemSubmit };
};
