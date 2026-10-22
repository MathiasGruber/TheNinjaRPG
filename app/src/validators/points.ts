import { z } from "zod";
import {
  STORE_BUNDLE_MAX_ITEMS,
  STORE_BUNDLE_MAX_PRICE_CENTS,
  STORE_BUNDLE_MAX_QUANTITY,
  STORE_BUNDLE_MAX_RYO,
  WEB_REP_MAX,
  WEB_REP_MIN,
} from "@/drizzle/constants";

export const buyRepsSchema = z.object({
  reputationPoints: z.number().int().min(WEB_REP_MIN).max(WEB_REP_MAX),
});

export type BuyRepsSchema = z.infer<typeof buyRepsSchema>;

export const searchPaypalTransactionSchema = z
  .strictObject({
    transactionId: z.string().min(4).max(255),
    transactionDate: z.date(),
  })
  .required();

export type SearchPaypalTransactionSchema = z.infer<
  typeof searchPaypalTransactionSchema
>;

/** Paid bundles contain guaranteed quantities; no random rewards or gameplay multipliers. */
export const storeContentsSchema = z
  .object({
    reputationPoints: z.number().int().min(0).max(WEB_REP_MAX),
    money: z.number().int().min(0).max(STORE_BUNDLE_MAX_RYO),
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(191),
          quantity: z.number().int().min(1).max(STORE_BUNDLE_MAX_QUANTITY),
        }),
      )
      .max(STORE_BUNDLE_MAX_ITEMS)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Select each item once",
      ),
  })
  .refine(
    (contents) =>
      contents.reputationPoints > 0 || contents.money > 0 || contents.items.length > 0,
    "Add reputation, ryo or items",
  );
export const storeBundleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  priceCents: z.number().int().min(100).max(STORE_BUNDLE_MAX_PRICE_CENTS),
  isActive: z.boolean(),
  contents: storeContentsSchema,
});
export const storeCheckoutSchema = z.object({
  recipientId: z.string().min(1).max(191),
  selection: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("custom"),
      reputationPoints: buyRepsSchema.shape.reputationPoints,
    }),
    z.object({ type: z.literal("bundle"), bundleId: z.string().min(1).max(191) }),
  ]),
});
export type StoreContents = z.infer<typeof storeContentsSchema>;
export type StoreBundleInput = z.infer<typeof storeBundleSchema>;
