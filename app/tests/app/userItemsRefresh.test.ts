import { readFileSync } from "node:fs";
import { join } from "node:path";
import { waitFor } from "@testing-library/react";
import { MutationObserver, type MutationObserverOptions, QueryClient, QueryObserver, type QueryObserverOptions } from "@tanstack/react-query";
import { describe, expect, it, vi } from "bun:test";
import type { z } from "zod";
import { finishItemConsumeRequest } from "@/libs/itemConsumption";
import { isRetryableTrpcError } from "@/utils/error";
import type { consumeItemInputSchema } from "@/validators/cooking";

const sourceRoot = join(import.meta.dirname, "../../src");
const read = (file: string) => readFileSync(join(sourceRoot, file), "utf8");
const provider = read("app/_trpc/Provider.tsx");
const staleTimeExpression = provider.match(/\bstaleTime:\s*([^,\n]+)/)?.[1];
if (!staleTimeExpression) throw new Error("Provider query staleTime was not found");
const staleTime = new Function(`return (${staleTimeExpression});`)() as number;

/**
 * Pages that list the player's inventory. Items are granted by flows that cannot all invalidate
 * the cache (quest rewards, battle loot, queued jobs, other players' trades), so each page must
 * re-read it when mounted. The options are taken from the source so dropping them fails here.
 */
const inventoryQueries = [
  { file: "app/[shell]/items/page.tsx", procedure: "getUserItemsWithVariants" },
  { file: "app/[shell]/auctionhouse/page.tsx", procedure: "getUserItems" },
  { file: "app/[shell]/auctionhouse/Offers.tsx", procedure: "getUserItems" },
];

const queryOptions = (file: string, procedure: string) => {
  const pattern = new RegExp(
    `api\\.item\\.${procedure}\\.useQuery\\(undefined,\\s*(\\{[\\s\\S]*?\\})\\)`,
  );
  const expression = read(file)
    .match(pattern)?.[1]
    ?.replace(/\/\/.*$/gm, "");
  if (!expression) throw new Error(`${procedure} query options were not found in ${file}`);
  return new Function("userData", `return (${expression});`)({ id: "user" }) as Omit<
    QueryObserverOptions<string[]>,
    "queryKey" | "queryFn"
  >;
};

describe("inventory pages", () => {
  it("refreshes a rejected meal's stale modal snapshot and clears pending state", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime, retry: false } } });
    let quantity = 3;
    let activeMeal = "old meal";
    const inventory = new QueryObserver(client, { queryKey: ["inventory"], queryFn: async () => quantity });
    const profile = new QueryObserver(client, { queryKey: ["profile"], queryFn: async () => activeMeal });
    const unsubscribeInventory = inventory.subscribe(() => {});
    const unsubscribeProfile = profile.subscribe(() => {});
    let isOpen = true;
    let selected: unknown = { item: { itemType: "MEAL" }, quantity: 3 };
    const toast = vi.fn();
    const backpack = read("app/[shell]/items/page.tsx").split("const Backpack:")[1]!;
    const settled = backpack.match(/const onSettled = (\(\) => \{[\s\S]*?\n  \});/)?.[1];
    const callbacks = backpack.match(/api\.item\.consume\.useMutation\((\{[\s\S]*?\n  \})\);/)?.[1];
    if (!settled || !callbacks) throw new Error("Backpack consume callbacks were not found");
    const onSettled = new Function("setIsOpen", "setUserItem", `return (${settled});`)(
      (value: boolean) => { isOpen = value; },
      (value: unknown) => { selected = value; },
    );
    const options = new Function("utils", "useritem", "showMutationToast", "showRewardToast", "onSettled", "finishItemConsumeRequest", "userData", `return (${callbacks});`)(
      {
        profile: { getUser: { invalidate: () => client.invalidateQueries({ queryKey: ["profile"] }) } },
        item: { getUserItemsWithVariants: { invalidate: () => client.invalidateQueries({ queryKey: ["inventory"] }) } },
      },
      selected,
      toast,
      vi.fn(),
      onSettled,
      finishItemConsumeRequest,
      { userId: "user" },
    ) as MutationObserverOptions<{ success: boolean; message: string }, Error, z.input<typeof consumeItemInputSchema>>;
    const consume = new MutationObserver(client, { ...options, mutationFn: async () => ({ success: false, message: "Your meal stack changed. Refresh your inventory and try again" }) });
    try {
      await waitFor(() => expect(inventory.getCurrentResult().data).toBe(3));
      await waitFor(() => expect(profile.getCurrentResult().data).toBe("old meal"));
      // Another tab consumes a meal while this modal still holds its earlier quantity.
      quantity = 2;
      activeMeal = "Rice Bowl";
      document.body.style.cursor = "wait";
      await consume.mutate({ userItemId: "meal-stack", expectedQuantity: 3 });

      expect(toast).toHaveBeenCalledWith({ success: false, message: "Your meal stack changed. Refresh your inventory and try again" });
      expect(inventory.getCurrentResult().data).toBe(2);
      expect(profile.getCurrentResult().data).toBe("Rice Bowl");
      expect(consume.getCurrentResult().isPending).toBe(false);
      expect(isOpen).toBe(false);
      expect(selected).toBeUndefined();
      expect(document.body.style.cursor).toBe("default");
    } finally {
      unsubscribeInventory();
      unsubscribeProfile();
      client.clear();
    }
  });

  for (const file of ["app/[shell]/items/page.tsx", "app/[shell]/travel/page.tsx"]) {
    it.each([
      { message: "Internal server error", cache: true, expected: undefined },
      { message: "Invalid input", cache: false, expected: undefined },
      { message: "Failed to fetch", cache: true, expected: "Could not confirm item use. Try Consume again to check the opening." },
      { message: "Failed to fetch", cache: false, expected: "Could not confirm item use. Refresh your inventory to check the result." },
    ])(`${file} handles $message for cache: $cache without duplicating global error feedback`, async ({ message, cache, expected }) => {
      const source = read(file);
      const callbacks = source.match(/api\.item\.consume\.useMutation\((\{[\s\S]*?\n  \})\);/)?.[1];
      if (!callbacks) throw new Error("Consume callbacks were not found");
      const toast = vi.fn();
      let isOpen = true;
      let selected: unknown = { item: { itemType: cache ? "CONSUMABLE" : "MEAL", effects: cache ? [{ type: "noncombatconsumereward", rewardMode: "weightedCache" }] : [] } };
      const setIsOpen = (value: boolean) => { isOpen = value; };
      const setUserItem = (value: unknown) => { selected = value; };
      const settled = source.split("const Backpack:")[1]?.match(/const onSettled = (\(\) => \{[\s\S]*?\n  \});/)?.[1];
      const onSettled = settled ? new Function("setIsOpen", "setUserItem", `return (${settled});`)(setIsOpen, setUserItem) : undefined;
      const options = new Function("showMutationToast", "isRetryableTrpcError", "useritem", "onSettled", "setIsOpen", "setUserItem", `return (${callbacks});`)(
        toast, isRetryableTrpcError, selected, onSettled, setIsOpen, setUserItem,
      ) as MutationObserverOptions<never, Error, z.input<typeof consumeItemInputSchema>>;
      const client = new QueryClient();
      const error = new Error(message);
      const consume = new MutationObserver(client, { ...options, mutationFn: async () => { throw error; } });
      try {
        await expect(consume.mutate({ userItemId: "selected-item" })).rejects.toBe(error);
        if (expected) {
          expect(toast).toHaveBeenCalledTimes(1);
          expect(toast).toHaveBeenCalledWith({ success: false, message: expected });
        } else expect(toast).not.toHaveBeenCalled();
        expect(consume.getCurrentResult().isPending).toBe(false);
        expect(isOpen).toBe(false);
        expect(selected).toBeUndefined();
      } finally {
        client.clear();
      }
    });
  }

  for (const { file, procedure } of inventoryQueries) {
    it(`${file} shows items obtained since its last visit`, async () => {
      const client = new QueryClient({ defaultOptions: { queries: { staleTime, retry: false } } });
      let inventory = ["Kunai"];
      let reads = 0;
      const mount = () =>
        new QueryObserver<string[]>(client, {
          ...queryOptions(file, procedure),
          queryKey: [["item", procedure], { type: "query" }],
          queryFn: async () => {
            reads++;
            return [...inventory];
          },
        });
      let observer = mount();
      let unsubscribe = observer.subscribe(() => {});
      try {
        await waitFor(() => expect(observer.getCurrentResult().data).toEqual(["Kunai"]));
        unsubscribe();

        // A quest reward lands while the player is elsewhere, without touching this cache.
        inventory = ["Kunai", "Quest Reward Scroll"];

        observer = mount();
        unsubscribe = observer.subscribe(() => {});
        await waitFor(() =>
          expect(observer.getCurrentResult().data).toEqual(["Kunai", "Quest Reward Scroll"]),
        );
        expect(reads).toBe(2);
      } finally {
        unsubscribe();
        client.clear();
      }
    });
  }
});

describe("item-granting flows", () => {
  const userItemCaches = ["getUserItems", "getUserItemsWithVariants"];
  const flows = [
    { file: "layout/Logbook.tsx", flow: "quests.checkRewards" },
    { file: "layout/RewardChoice.tsx", flow: "quests.claimRewardChoice" },
    { file: "layout/Sector.tsx", flow: "quests.checkLocationQuest" },
    { file: "layout/Combat.tsx", flow: "battle end" },
  ];
  for (const { file, flow } of flows) {
    it(`${flow} invalidates both user item caches`, () => {
      const source = read(file);
      for (const cache of userItemCaches) {
        expect(source).toContain(`utils.item.${cache}.invalidate()`);
      }
    });
  }
});
