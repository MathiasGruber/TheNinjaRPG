import { readFileSync } from "node:fs";
import { join } from "node:path";
import { waitFor } from "@testing-library/react";
import { QueryClient, QueryObserver, type QueryObserverOptions } from "@tanstack/react-query";
import { describe, expect, it } from "bun:test";

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
