import { MAX_EXTRA_JUTSU_SLOTS } from "@/drizzle/constants";

/** Purchases and consumable grants reserve capacity in the same extra-slot counter. */
export const getJutsuSlotIncreaseLimit = (quantity = 1) =>
  MAX_EXTRA_JUTSU_SLOTS - quantity;

export const getJutsuSlotIncreaseError = (currentSlots: number, quantity = 1) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_EXTRA_JUTSU_SLOTS)
    return "This jutsu slot grant has an invalid quantity. Please contact staff.";
  if (currentSlots >= MAX_EXTRA_JUTSU_SLOTS)
    return `You already have the maximum of ${MAX_EXTRA_JUTSU_SLOTS} extra jutsu slots. Purchases and consumable grants share this limit.`;
  if (currentSlots > getJutsuSlotIncreaseLimit(quantity))
    return `Adding ${quantity} jutsu slots would exceed the maximum of ${MAX_EXTRA_JUTSU_SLOTS} extra slots. You currently have ${currentSlots}.`;
  return null;
};
