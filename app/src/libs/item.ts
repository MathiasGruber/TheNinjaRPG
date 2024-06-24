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
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { getUserFederalStatus } from "@/utils/paypal";
import { FED_NORMAL_INVENTORY_SLOTS } from "@/drizzle/constants";
import { FED_SILVER_INVENTORY_SLOTS } from "@/drizzle/constants";
import { FED_GOLD_INVENTORY_SLOTS } from "@/drizzle/constants";
import type { Item, UserData } from "@/drizzle/schema";
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
      showMutationToast(data);
      refetch();
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
    (errors) => showFormErrorsToast(errors),
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
    { id: "repsCost", type: "number" },
    { id: "cooldown", label: "cooldown", type: "number" },
    { id: "canStack", type: "number" },
    { id: "stackSize", type: "number" },
    { id: "destroyOnUse", type: "number" },
    { id: "range", type: "number" },
    { id: "chakraCost", type: "number" },
    { id: "staminaCost", type: "number" },
    { id: "chakraCostReducePerLvl", type: "number" },
    { id: "staminaCostReducePerLvl", type: "number" },
    { id: "healthCostReducePerLvl", type: "number" },
    { id: "actionCostPerc", type: "number" },
    { id: "healthCost", type: "number" },
    { id: "hidden", type: "number", label: "Hidden" },
  ];

  return { item, effects, form, formData, setEffects, handleItemSubmit };
};

/**
 * Checks if an item is consumable outside of combat.
 * @param item - The item to check.
 * @param userData - The user data.
 * @returns True if the item is consumable outside of combat, false otherwise.
 */
/**
 * Checks if an item is consumable outside of combat.
 * @param item - The item to check.
 * @param userData - The user data.
 * @returns True if the item is consumable outside of combat, false otherwise.
 */
export const nonCombatConsume = (item: Item, userData: UserData): boolean => {
  if (item.itemType !== "CONSUMABLE") {
    return false;
  }

  for (const effect of item.effects) {
    if (effect.type === "rollbloodline") {
      return true;
    } else if (effect.type === "removebloodline" && userData.bloodlineId) {
      return true;
    }
  }

  return false;
};

/**
 * Calculates the maximum number of items for a user.
 *
 * @param user - The user data.
 * @returns The maximum number of items.
 */
export const calcMaxItems = (user: UserData) => {
  const base = 20;
  const fedContrib = (user: UserData) => {
    const status = getUserFederalStatus(user);
    switch (status) {
      case "NORMAL":
        return FED_NORMAL_INVENTORY_SLOTS;
      case "SILVER":
        return FED_SILVER_INVENTORY_SLOTS;
      case "GOLD":
        return FED_GOLD_INVENTORY_SLOTS;
    }
    return 0;
  };
  return base + user.extraItemSlots + fedContrib(user);
};
