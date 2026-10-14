import {
  MAX_ITEM_SHOP_PURCHASE_QUANTITY,
  MEDNIN_HEAL_ITEM_DISCOUNT_PERC,
} from "@/drizzle/constants";
import type { Item } from "@/drizzle/schema";

const MIN_ITEM_SHOP_DISCOUNT_FACTOR = 0.05;

export const getMaxItemShopPurchaseQuantity = (stackSize: number) =>
  Math.min(stackSize, MAX_ITEM_SHOP_PURCHASE_QUANTITY);

export const isItemAvailableInStore = (
  expireFromStoreAt: string | Date | null | undefined,
  now: Date = new Date(),
) => !expireFromStoreAt || new Date(expireFromStoreAt) > now;

export function shopItemDiscountFactor(
  item: Item,
  structureDiscountPerc: number,
  anbuDiscountPerc: number,
  loyaltyDiscountPerc = 0,
) {
  const healDiscount = item.effects.some((e) => e.type === "heal")
    ? MEDNIN_HEAL_ITEM_DISCOUNT_PERC
    : 0;
  return Math.max(
    MIN_ITEM_SHOP_DISCOUNT_FACTOR,
    (100 -
      structureDiscountPerc -
      anbuDiscountPerc -
      healDiscount -
      loyaltyDiscountPerc) /
      100,
  );
}
