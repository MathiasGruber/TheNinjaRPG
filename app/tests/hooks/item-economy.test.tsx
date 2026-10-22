import * as radixSize from "@radix-ui/react-use-size";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { Controller, type UseFormReturn } from "react-hook-form";
import * as client from "@/app/_trpc/client";
import type { Item } from "@/drizzle/schema";
import { useItemEditForm } from "@/hooks/item";
import { EditContent } from "@/layout/EditContent";
import { ItemValidator, ItemValidatorRawSchema, type ZodItemType } from "@/validators/combat";
import { DEFAULT_FURNITURE_DATA, FURNITURE_ITEM_DEFAULTS } from "@/validators/item";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
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
const updateItem = vi.fn();
const originalEvent = globalThis.Event;

beforeEach(() => {
  globalThis.Event = window.Event;
  updateItem.mockReset();
  Object.assign(vi.spyOn(client, "api" as never), {
    item: {
      getAllNames: { useQuery: () => ({ data: [] }) },
      update: { useMutation: () => ({ mutateAsync: updateItem, isPending: false }) },
    },
    skillTree: { getAllNames: { useQuery: () => ({ data: [] }) } },
    bloodline: { getAllNames: { useQuery: () => ({ data: [] }) } },
    gameAsset: {
      getNameTags: { useQuery: () => ({ data: undefined }) },
      getSceneAssets: { useQuery: () => ({ data: [] }) },
      getAll: { useInfiniteQuery: () => ({ data: { pages: [] } }) },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.Event = originalEvent;
});

describe("staff item economy editor", () => {
  it("saves ordinary items after the page converts nullable fields to empty strings", async () => {
    const pageData = { ...data, furnitureData: null };
    setNullsToEmptyStrings(pageData);
    const { result } = renderHook(() => useItemEditForm(pageData, async () => undefined));
    await act(async () => {
      result.current.form.setValue("name", "Renamed shop item", { shouldDirty: true });
      await result.current.handleItemSubmit();
    });
    expect(result.current.form.getFieldState("furnitureData").error).toBeUndefined();
    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem).toHaveBeenCalledWith(expect.objectContaining({
      id: data.id,
      data: expect.objectContaining({ name: "Renamed shop item", furnitureData: null }),
    }));
    expect(ItemValidator.safeParse(result.current.form.getValues()).success).toBe(true);
  });
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
    expect(result.current.formData.some((field) => field.id === "furnitureData.action")).toBe(false);
    await act(async () => {
      result.current.form.setValue("itemType", "FURNITURE");
    });
    expect(result.current.form.getValues()).toMatchObject({
      effects: [], slot: "NONE", target: "SELF", maxEquips: 0,
      preventBattleUsage: true, maxImbueNumber: 0, maxDurability: 0,
      canBeImbued: false,
      furnitureData: { action: null, width: 24, groundAnchor: 100, isFloor: false },
    });
    const ids = result.current.formData.map((field) => field.id);
    expect(ids).toContain("furnitureData.action");
    expect(ids).not.toContain("furnitureData.width");
    expect(ids).not.toContain("furnitureData.groundAnchor");
    expect(ids).toContain("furnitureData.isFloor");
    expect(ids).not.toContain("battleDescription");
    expect(ids).not.toContain("slot");
    expect(ids).not.toContain("image");
    expect(await result.current.form.trigger()).toBe(true);
  });
  it("saves nested furniture settings and clears them when changing to another item type", async () => {
    const { result } = renderHook(() => useItemEditForm(data, async () => undefined));
    await act(async () => {
      result.current.form.setValue("itemType", "FURNITURE");
    });
    await act(async () => {
      result.current.form.setValue("furnitureData.width", 32);
      result.current.form.setValue("furnitureData.action", "storage");
    });
    expect(ItemValidator.parse(result.current.form.getValues()).furnitureData).toMatchObject({
      width: 32, action: "storage",
    });
    await act(async () => {
      result.current.form.setValue("itemType", "MATERIAL");
    });
    expect(result.current.form.getValues("furnitureData")).toBeNull();
    expect(await result.current.form.trigger()).toBe(true);
  });
  it("clears and saves loaded furniture after editing its nested controls", async () => {
    vi.spyOn(radixSize, "useSize").mockReturnValue({ width: 0, height: 0 });
    const savedFurniture = {
      ...data,
      ...ItemValidator.parse({
        ...data,
        ...FURNITURE_ITEM_DEFAULTS,
        itemType: "FURNITURE",
        furnitureData: {
          ...DEFAULT_FURNITURE_DATA,
          action: "storage",
          width: 32,
          views: { "90": { image: "chair-90.webp" } },
        },
      }),
    } as typeof data;
    let editor!: ReturnType<typeof useItemEditForm>;
    const FurnitureEditor = () => {
      editor = useItemEditForm(savedFurniture, async () => undefined);
      return <>
        <EditContent
          schema={ItemValidatorRawSchema}
          form={editor.form as unknown as UseFormReturn<ZodItemType>}
          formData={editor.formData.filter((field) => field.id.startsWith("furnitureData."))}
          showSubmit={false}
        />
        {editor.form.getValues("itemType") === "FURNITURE" && <Controller
          control={editor.form.control}
          name="furnitureData.views"
          render={({ field }) => <output>{JSON.stringify(field.value)}</output>}
        />}
        <output data-testid="dirty">{String(editor.form.formState.isDirty)}</output>
      </>;
    };
    const view = render(<FurnitureEditor />);
    expect(view.getByTestId("dirty").textContent).toBe("false");
    expect(editor.form.getValues("furnitureData")).toEqual(savedFurniture.furnitureData);
    const floor = view.getByRole("switch", { name: "Floor decoration" });
    fireEvent.click(floor);
    expect(editor.form.getValues("furnitureData.isFloor")).toBe(true);
    expect(editor.form.getFieldState("furnitureData.isFloor").isDirty).toBe(true);
    fireEvent.click(floor);
    expect(view.getByTestId("dirty").textContent).toBe("false");
    expect(editor.form.getValues("furnitureData")).toEqual(savedFurniture.furnitureData);
    await act(async () => {
      editor.form.setValue("itemType", "MATERIAL", { shouldDirty: true });
    });
    expect(view.queryByRole("switch", { name: "Floor decoration" })).toBeNull();
    expect(editor.form.getValues("furnitureData")).toBeNull();
    expect(editor.form.getFieldState("furnitureData").isDirty).toBe(true);
    expect(editor.form.formState.defaultValues?.furnitureData).toEqual(savedFurniture.furnitureData);
    expect(view.getByTestId("dirty").textContent).toBe("true");
    await act(async () => {
      expect(await editor.form.trigger()).toBe(true);
      await editor.handleItemSubmit();
    });
    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem).toHaveBeenCalledWith(expect.objectContaining({
      id: data.id,
      data: expect.objectContaining({ itemType: "MATERIAL", furnitureData: null }),
    }));
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
