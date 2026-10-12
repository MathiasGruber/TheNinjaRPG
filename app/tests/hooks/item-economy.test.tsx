import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as client from "@/app/_trpc/client";
import type { Item } from "@/drizzle/schema";
import { useItemEditForm } from "@/hooks/item";
import { ItemValidator } from "@/validators/combat";
import { FURNITURE_IMAGE_PROMPT } from "@/libs/imagePrompts";
import { ensureDom } from "../setup-dom.mjs";

ensureDom();
const validItem = ItemValidator.parse({
  name: "Shop item",
  image: "item.webp",
  description: "Shop item",
  battleDescription: "",
  stackSize: 10,
  chakraCost: 0,
  healthCost: 0,
  staminaCost: 0,
  healthCostReducePerLvl: 0,
  chakraCostReducePerLvl: 0,
  staminaCostReducePerLvl: 0,
  actionCostPerc: 100,
  maxImbueNumber: 1,
  maxDurability: 100,
  hidden: false,
  cooldown: 0,
  cost: 1,
  repsCost: 0,
  seichiSilverCost: 0,
  range: 0,
  maxEquips: 0,
  method: "SINGLE",
  target: "SELF",
  itemType: "MATERIAL",
  weaponType: "NONE",
  rarity: "COMMON",
  slot: "NONE",
  expireFromStoreAt: null,
  effects: [],
  farmYieldItemId: null,
  farmExtractSeedItemId: null,
  crystalTargetTypes: null,
  bloodlineId: null,
});
const data = {
  ...validItem,
  id: "shop-item",
  createdAt: new Date(),
  updatedAt: new Date(),
  craftingRequirements: [],
} as Item & { craftingRequirements: [] };

beforeEach(() => {
  Object.assign(vi.spyOn(client, "api" as never), {
    item: {
      getAllNames: { useQuery: () => ({ data: [] }) },
      update: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    skillTree: { getAllNames: { useQuery: () => ({ data: [] }) } },
    bloodline: { getAllNames: { useQuery: () => ({ data: [] }) } },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("staff item economy editor", () => {
  it("normalizes an existing combat item when switching to furniture and exposes placement controls", async () => {
    const { result } = renderHook(() => useItemEditForm({
      ...data,
      itemType: "WEAPON",
      maxEquips: 1,
      slot: "HAND",
      target: "CHARACTER",
      canBeImbued: true,
      effects: [{ type: "damage", description: "Attack", power: 1 }],
    } as unknown as typeof data, async () => undefined));
    expect(result.current.formData.some((field) => field.id === "furnitureAction")).toBe(false);
    await act(async () => {
      result.current.form.setValue("itemType", "FURNITURE");
    });
    expect(result.current.form.getValues()).toMatchObject({
      effects: [], slot: "NONE", target: "SELF", maxEquips: 0,
      preventBattleUsage: true, maxImbueNumber: 0, maxDurability: 0,
      canBeImbued: false,
    });
    const ids = result.current.formData.map((field) => field.id);
    expect(ids).toContain("furnitureAction");
    expect(ids).toContain("furnitureWidth");
    expect(ids).toContain("furnitureGroundAnchor");
    expect(ids).toContain("furnitureIsFloor");
    expect(ids).not.toContain("battleDescription");
    expect(ids).not.toContain("slot");
    expect(result.current.formData.find((field) => field.id === "image")).toMatchObject({
      size: "landscape", maxDim: 768, preprompt: FURNITURE_IMAGE_PROMPT,
    });
    expect(await result.current.form.trigger()).toBe(true);
  });
  it("clears seed extraction when an extractable crop becomes furniture", async () => {
    const crop = { ...data, itemType: "COOKING" as const, farmExtractSeedItemId: "rice-seed", farmExtractSeedCount: 5 };
    expect(ItemValidator.safeParse(crop).success).toBe(true);
    const { result } = renderHook(() => useItemEditForm(crop, async () => undefined));
    expect(result.current.formData.some((field) => field.id === "farmExtractSeedItemId")).toBe(true);
    await act(async () => {
      result.current.form.setValue("itemType", "FURNITURE");
    });
    expect(result.current.form.getValues()).toMatchObject({
      farmExtractSeedItemId: null, farmExtractSeedCount: 0,
    });
    expect(result.current.formData.some((field) => field.id === "farmExtractSeedItemId")).toBe(false);
    expect(result.current.formData.some((field) => field.id === "farmExtractSeedCount")).toBe(false);
    expect(await result.current.form.trigger()).toBe(true);
    expect(ItemValidator.safeParse(result.current.form.getValues()).success).toBe(true);
  });
  it("starts unrestricted and places fields beside shop/trading settings", () => {
    const { result } = renderHook(() => useItemEditForm(data, async () => undefined));
    expect(result.current.form.getValues("purchaseLimitPeriod")).toBe("NONE");
    expect(result.current.form.getValues("purchaseLimit")).toBeNull();
    expect(result.current.form.getValues("auctionMinPrice")).toBeNull();
    expect(result.current.form.getValues("auctionMaxPrice")).toBeNull();
    const ids = result.current.formData.map((field) => field.id);
    expect(ids.slice(ids.indexOf("inShop"), ids.indexOf("inShop") + 3)).toEqual([
      "inShop",
      "purchaseLimitPeriod",
      "purchaseLimit",
    ]);
    expect(
      ids.slice(ids.indexOf("canBeTraded"), ids.indexOf("canBeTraded") + 3),
    ).toEqual(["canBeTraded", "auctionMinPrice", "auctionMaxPrice"]);
  });
  it("requires quantity for a limited period and allows clearing bounds", async () => {
    const { result } = renderHook(() => useItemEditForm(data, async () => undefined));
    await act(async () => {
      result.current.form.setValue("purchaseLimitPeriod", "DAILY");
      await result.current.form.trigger("purchaseLimit");
    });
    expect(result.current.form.getFieldState("purchaseLimit").error?.message).toContain(
      "requires a quantity",
    );
    await act(async () => {
      result.current.form.setValue("purchaseLimit", 5);
      result.current.form.setValue("auctionMinPrice", "");
      result.current.form.setValue("auctionMaxPrice", "");
      await result.current.form.trigger();
    });
    expect(result.current.form.getFieldState("purchaseLimit").error).toBeUndefined();
    expect(result.current.form.getFieldState("auctionMinPrice").error).toBeUndefined();
    expect(result.current.form.getFieldState("auctionMaxPrice").error).toBeUndefined();
  });
});
