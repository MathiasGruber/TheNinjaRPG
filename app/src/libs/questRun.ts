import type { UserQuest } from "@/drizzle/schema";
import type { QuestContentType } from "@/validators/objectives";

/** Shared feedback for server rejections and the isolated-run boundary. */
export const ISOLATED_PYRAMID_MESSAGE =
  "Complete or abandon your isolated Battle Pyramid before using outside healing, inventory or travel.";

/** History owns isolation so hidden content and discarded checkpoint trackers cannot unlock it. */
export const getIsolatedPyramid = (
  user: { userQuests?: readonly UserQuest[] } | null | undefined,
) =>
  user?.userQuests?.find((entry) => entry.isolated && !entry.endAt && !entry.completed);

/** Versioned runs must restart after authored edits; visibility-only edits keep the run valid. */
export const hasQuestContentChanged = (entry: UserQuest) =>
  (entry.questType === "battlepyramid" || entry.isolated) &&
  !!entry.questVersion &&
  new Date(entry.questVersion).getTime() !== new Date(entry.quest.updatedAt).getTime();

/** Every selected item is required; duplicate selections add to the required quantity. */
export const getQuestEntryRequirements = (
  content: Pick<QuestContentType, "entryItems">,
) => {
  const quantities = new Map<string, number>();
  for (const group of content.entryItems ?? []) {
    for (const itemId of group.ids)
      quantities.set(itemId, (quantities.get(itemId) ?? 0) + group.number);
  }
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
};

/** Block outside recovery, inventory and travel pages, including their nested routes. */
export const isPyramidRestrictedPath = (pathname: string) =>
  ["/hospital", "/ramenshop", "/items", "/inventory", "/travel"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

/** Enforce player restrictions without blocking staff item-content management procedures. */
export const isPyramidRestrictedProcedure = (path: string) =>
  path.startsWith("hospital.") ||
  path.startsWith("travel.") ||
  path === "village.buyFood" ||
  path === "combat.battleArenaHeal" ||
  (path.startsWith("item.") &&
    [
      "getUserItem",
      "getUserItems",
      "getUserItemsWithVariants",
      "getUserItemCounts",
      "evolveItem",
      "purchaseVariant",
      "selectVariant",
      "consumeVariantToken",
      "mergeStacks",
      "mergeAllStacks",
      "splitStack",
      "sellUserItem",
      "toggleEquip",
      "unequipAllItems",
      "consume",
      "repair",
      "repairAll",
      "useRepairItem",
      "useRepairAll",
      "buy",
      "autoEquipOptimal",
      "getItemLoadouts",
      "selectItemLoadout",
      "renameLoadout",
    ].includes(path.slice("item.".length)));
