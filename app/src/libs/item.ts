import { getUserFederalStatus } from "@/utils/paypal";
import { FED_NORMAL_INVENTORY_SLOTS } from "@/drizzle/constants";
import { FED_SILVER_INVENTORY_SLOTS } from "@/drizzle/constants";
import { FED_GOLD_INVENTORY_SLOTS } from "@/drizzle/constants";
import { structureBoost } from "@/utils/village";
import { ANBU_ITEMSHOP_DISCOUNT_PERC } from "@/drizzle/constants";
import type { Item, UserItem, UserData, VillageStructure } from "@/drizzle/schema";

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
    } else if (effect.type === "heal") {
      return true;
    } else if (effect.type === "marriageslotincrease") {
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
  const staffRoles = [
    "CODING-ADMIN",
    "CONTENT-ADMIN",
    "MODERATOR-ADMIN",
    "HEAD_MODERATOR",
    "MODERATOR",
    "JR_MODERATOR",
    "CONTENT",
    "EVENT",
  ];
  const isStaff = staffRoles.includes(user.role);
  const fedContrib = (user: UserData) => {
    if (isStaff) {
      return FED_GOLD_INVENTORY_SLOTS;
    }
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

/**
 * Calculates the selling price of a user's item based on various discounts and factors.
 *
 * @param user - The user data containing information about the user.
 * @param useritem - The user's item data, including the item details.
 * @param structures - The list of village structures that may affect the discount.
 * @returns The calculated selling price of the item.
 */
export const calcItemSellingPrice = (
  user: UserData,
  useritem: (UserItem & { item: Item }) | undefined,
  structures: VillageStructure[] | undefined,
) => {
  if (!useritem) return 0;
  const bDiscount = 80;
  const sDiscount = structureBoost("itemDiscountPerLvl", structures);
  const aDiscount = user.anbuId ? ANBU_ITEMSHOP_DISCOUNT_PERC : 0;
  const discount = Math.min(bDiscount + sDiscount + aDiscount, 95);
  const factor = (100 - discount) / 100;
  const isEventItem = useritem.item.isEventItem;
  const cost = isEventItem ? 0 : useritem.item.cost * useritem.quantity * factor;
  return Math.floor(cost);
};
