import { ensureDom } from "../setup-dom.mjs";

ensureDom();
const { cleanup, fireEvent, render } = await import("@testing-library/react");
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as client from "@/app/_trpc/client";
import type { ItemRarity } from "@/drizzle/constants";
import type { UserItemWithRelations } from "@/drizzle/schema";
import * as combatActions from "@/layout/CombatActions";
import { CraftingCatalog } from "@/layout/CraftingCatalog";
import * as itemWithEffects from "@/layout/ItemWithEffects";
import * as modal from "@/layout/Modal";
import type { UserWithRelations } from "@/routers/profile";

type CatalogProps = ComponentProps<typeof CraftingCatalog>;
type CraftableItem = NonNullable<CatalogProps["craftableItems"]>[number];

const material = { id: "material", name: "Material", rarity: "COMMON" };

const makeItem = (rarity: ItemRarity) =>
  ({
    id: `blade-${rarity}`,
    name: `${rarity} blade`,
    image: "",
    itemType: "WEAPON",
    rarity,
    effects: [],
    hidden: false,
    craftingExperience: 0,
    craftingRequirements: [
      { quantity: 1, requirementItemId: material.id, requirementItem: material },
    ],
  }) as unknown as CraftableItem;

const userItems = [
  { id: "owned", itemId: material.id, quantity: 10, item: material },
] as unknown as UserItemWithRelations[];

// Experience of the support-ticket player (Apprentice crafter)
const apprentice = {
  craftingExperience: 1_175_305,
  village: null,
} as unknown as UserWithRelations;

const renderCatalog = (rarity: ItemRarity) => {
  const view = render(
    <CraftingCatalog
      craftableItems={[makeItem(rarity)]}
      userItems={userItems}
      userData={apprentice}
      isBusy={false}
      isQueueFull={false}
    />,
  );
  fireEvent.click(view.getByText("Weapons"));
  fireEvent.click(view.getByRole("button", { name: `${rarity} blade` }));
  return view;
};

describe("CraftingCatalog crafting rank gate", () => {
  beforeEach(() => {
    Object.assign(vi.spyOn(client, "api" as never), {
      useUtils: () => ({}),
      occupation: {
        craftItem: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    });
    vi.spyOn(modal, "default").mockImplementation(
      ({
        children,
        isOpen,
        proceed_label,
        proceedDisabled,
      }: {
        children: ReactNode;
        isOpen: boolean;
        proceed_label?: string | null;
        proceedDisabled?: boolean;
      }) =>
        isOpen ? (
          <div>
            {children}
            {proceed_label && (
              <button type="button" disabled={proceedDisabled}>
                {proceed_label}
              </button>
            )}
          </div>
        ) : null,
    );
    vi.spyOn(combatActions, "ActionSelector").mockImplementation(
      ({
        items,
        onClick,
      }: ComponentProps<typeof combatActions.ActionSelector>) => (
        <>
          {items?.map((entry) => (
            <button key={entry.id} type="button" onClick={() => onClick(entry.id)}>
              {entry.name}
            </button>
          ))}
        </>
      ),
    );
    vi.spyOn(itemWithEffects, "default").mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    { rarity: "EPIC", rank: "Master" },
    { rarity: "LEGENDARY", rank: "Forgemaster" },
  ] as const)("shows the required rank for $rarity items above Apprentice", ({
    rarity,
    rank,
  }) => {
    const view = renderCatalog(rarity);
    expect(view.getByText("Total Crafting Time:").parentElement?.textContent).toBe(
      `Total Crafting Time:Requires ${rank} rank`,
    );
    const craftButton = view.getByRole("button", { name: `Requires ${rank} rank` });
    expect((craftButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the crafting time and Craft button for rarities the rank allows", () => {
    const view = renderCatalog("RARE");
    expect(
      view.getByText("Total Crafting Time:").parentElement?.textContent,
    ).not.toContain("Requires");
    const craftButton = view.getByRole("button", { name: "Start Crafting" });
    expect((craftButton as HTMLButtonElement).disabled).toBe(false);
  });
});
