import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as dynamic from "next/dynamic";
import {
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
  useState,
} from "react";
import * as client from "@/app/_trpc/client";
import * as select from "@/components/ui/select";
import type { Village, VillageAlliance, VillageStructure } from "@/drizzle/schema";
import * as map from "@/hooks/map";
import * as Image from "@/layout/Image";
import * as toast from "@/libs/toast";
import type { UserWithRelations } from "@/routers/profile";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../setup-dom.mjs";

// Exercise declarations through WarMap while isolating map rendering and transport.
vi.spyOn(dynamic, "default").mockImplementation(
  () =>
    ((props: { onTileClick: (sector: number) => void }) => (
      <button type="button" onClick={() => props.onTileClick(102)}>
        Target tile
      </button>
    )) as never,
);
const { WarMap } = await import("@/layout/WarSystem");

type MutationResult = { success: boolean; message: string };
type MutationCallbacks = {
  onSuccess?: (result: MutationResult) => void | Promise<void>;
  onError?: () => void;
};

const mutation = () => {
  const mutate = vi.fn();
  let callbacks: MutationCallbacks;
  let setPending: Dispatch<SetStateAction<boolean>>;
  return {
    mutate,
    useMutation: (options: MutationCallbacks) => {
      const [isPending, setIsPending] = useState(false);
      callbacks = options;
      setPending = setIsPending;
      return {
        isPending,
        mutate: (input: unknown) => {
          mutate(input);
          setPending(true);
        },
      };
    },
    respond: async (result: MutationResult) => {
      await callbacks.onSuccess?.(result);
      setPending(false);
    },
    fail: () => {
      callbacks.onError?.();
      setPending(false);
    },
  };
};

const declarations = mutation();
const declare = declarations.mutate;
const releaseSector = mutation();
const leaveAlliance = mutation();
const declareEnemy = mutation();
const sectorWar = mutation();
const own = {
  id: "own",
  name: "Own",
  sector: 101,
  type: "VILLAGE",
  allianceSystem: true,
} as Village;
const target = {
  id: "target",
  name: "Target",
  sector: 102,
  type: "VILLAGE",
  allianceSystem: true,
} as Village;
const structures = [
  { id: "mission", name: "Mission Hall", route: "/missionhall" },
  { id: "training", name: "Training Grounds", route: "/traininggrounds" },
  { id: "town", name: "Town Hall", route: "/townhall" },
] as VillageStructure[];
let user: NonNullable<UserWithRelations>;
let ownsSector = false;
let relationshipStatus: VillageAlliance["status"] = "ENEMY";
const originalEvent = globalThis.Event;
const originalCustomEvent = globalThis.CustomEvent;

beforeEach(() => {
  ensureDom();
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  vi.clearAllMocks();
  ownsSector = false;
  relationshipStatus = "ENEMY";
  user = {
    userId: "leader",
    villageId: own.id,
    village: own,
    isOutlaw: false,
  } as NonNullable<UserWithRelations>;
  const invalidate = vi.fn(async () => {});
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({
      village: { getSectorOwnerships: { invalidate }, getAlliances: { invalidate } },
      travel: { getAllSectors: { invalidate } },
      war: { getActiveWars: { invalidate }, getRaidOptions: { invalidate } },
    }),
    travel: {
      getAllSectors: {
        useQuery: () => ({ data: ownsSector ? [{ villageId: own.id, sectors: [102] }] : [] }),
      },
    },
    village: {
      getVillageStructures: { useQuery: () => ({ data: structures }) },
      releaseSector,
      leaveAlliance,
      declareEnemy,
    },
    war: {
      getRaidOptions: {
        useQuery: () => ({ data: [], isFetching: false }),
      },
      declareSectorWar: sectorWar,
      declareVillageWarOrRaid: declarations,
    },
  });
  vi.spyOn(map, "useMap").mockReturnValue({ globe: {} as never, mapError: false });
  vi.spyOn(UserContext, "useRequiredUserData").mockImplementation(
    () => ({ data: user }) as never,
  );
  vi.spyOn(Image, "default").mockImplementation(() => <span />);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => {});
  vi.spyOn(select, "Select").mockImplementation(
    ({ value, onValueChange, children }: ComponentProps<typeof select.Select>) => (
      <select
        aria-label="Structure"
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        {children}
      </select>
    ),
  );
  vi.spyOn(select, "SelectTrigger").mockImplementation(
    Object.assign(() => <></>, { displayName: select.SelectTrigger.displayName }),
  );
  vi.spyOn(select, "SelectContent").mockImplementation(
    Object.assign(
      ({ children }: ComponentProps<typeof select.SelectContent>) => <>{children}</>,
      { displayName: select.SelectContent.displayName },
    ),
  );
  vi.spyOn(select, "SelectItem").mockImplementation(
    Object.assign(
      ({ value, children }: ComponentProps<typeof select.SelectItem>) => (
        <option value={value}>{children}</option>
      ),
      { displayName: select.SelectItem.displayName },
    ),
  );
});

afterEach(async () => {
  cleanup();
  // Radix restores focus in a deferred unmount callback before DOM constructors are reset.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.restoreAllMocks();
  globalThis.Event = originalEvent;
  globalThis.CustomEvent = originalCustomEvent;
});

const mount = () =>
  render(
    <WarMap
      user={user}
      isKage
      villages={ownsSector ? [user.village!] : [user.village!, target]}
      relationships={[
        {
          id: "enemies",
          villageIdA: own.id,
          villageIdB: target.id,
          status: relationshipStatus,
        } as VillageAlliance,
      ]}
    />,
  );

describe("war declaration targets", () => {
  it("declares ordinary village wars against the Town Hall", () => {
    const view = mount();
    fireEvent.click(view.getByRole("button", { name: "Target tile" }));
    fireEvent.click(view.getByRole("button", { name: "Declare War" }));
    expect(declare).toHaveBeenCalledTimes(1);
    expect(declare).toHaveBeenCalledWith({
      userVillageId: own.id,
      targetVillageId: target.id,
      targetStructureRoute: "/townhall",
    });
  });

  it("keeps the faction raid default and submits the selected structure", () => {
    user = { ...user, isOutlaw: true, village: { ...own, type: "HIDEOUT" } };
    const view = mount();
    fireEvent.click(view.getByRole("button", { name: "Target tile" }));
    const selector = view.getAllByRole("combobox", { name: "Structure" }).at(-1)!;
    expect((selector as HTMLSelectElement).value).toBe("/missionhall");
    expect(view.queryByRole("option", { name: "Town Hall" })).toBeNull();
    fireEvent.change(selector, { target: { value: "/traininggrounds" } });
    fireEvent.click(view.getByRole("button", { name: "Start Raid" }));
    expect(declare).toHaveBeenCalledTimes(1);
    expect(declare).toHaveBeenCalledWith({
      userVillageId: own.id,
      targetVillageId: target.id,
      targetStructureRoute: "/traininggrounds",
    });
  });
});

describe("war map confirmations", () => {
  for (const scenario of [
    { label: "Declare Enemy", status: "NEUTRAL", action: declareEnemy },
    { label: "Break Alliance", status: "ALLY", action: leaveAlliance },
    { label: "Release Sector", status: "ENEMY", action: releaseSector },
  ] as const) {
    it(`dismisses ${scenario.label} after acceptance and successful completion`, async () => {
      relationshipStatus = scenario.status;
      ownsSector = scenario.action === releaseSector;
      const view = mount();
      fireEvent.click(view.getByRole("button", { name: "Target tile" }));
      expect(view.getByRole("dialog")).toBeDefined();
      fireEvent.click(view.getByRole("button", { name: scenario.label }));
      expect(scenario.action.mutate).toHaveBeenCalledTimes(1);
      expect(view.queryByRole("dialog")).toBeNull();
      await act(() => scenario.action.respond({ success: true, message: "Success" }));
      expect(view.queryByRole("dialog")).toBeNull();
    });
  }

  for (const isOutlaw of [false, true]) {
    it(`keeps a rejected ${isOutlaw ? "raid" : "village war"} open for retry and closes on success`, async () => {
      if (isOutlaw) user = { ...user, isOutlaw, village: { ...own, type: "HIDEOUT" } };
      const label = isOutlaw ? "Start Raid" : "Declare War";
      const view = mount();
      fireEvent.click(view.getByRole("button", { name: "Target tile" }));
      fireEvent.click(view.getByRole("button", { name: label }));
      expect(view.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
      expect(
        view.getAllByRole("button", { name: /^Close$/ })
          .every((button) => (button as HTMLButtonElement).disabled),
      ).toBe(true);
      await act(() => declarations.respond({ success: false, message: "Declaration rejected" }));
      expect(view.getByRole("alert").textContent).toBe("Declaration rejected");
      expect(view.getByRole("dialog").getAttribute("aria-busy")).toBe("false");
      expect((view.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(view.getByRole("button", { name: label }));
      expect(view.queryByRole("alert")).toBeNull();
      expect(declare).toHaveBeenCalledTimes(2);
      await act(() => declarations.respond({ success: true, message: "Success" }));
      expect(view.queryByRole("dialog")).toBeNull();
    });
  }

  it("keeps a transport failure open with feedback and usable controls", async () => {
    const view = mount();
    fireEvent.click(view.getByRole("button", { name: "Target tile" }));
    fireEvent.click(view.getByRole("button", { name: "Declare War" }));
    await act(() => declarations.fail());
    expect(view.getByRole("alert").textContent).toBe(
      "The declaration could not be completed. Please try again.",
    );
    expect((view.getByRole("button", { name: "Declare War" }) as HTMLButtonElement).disabled).toBe(false);
    expect(
      view.getAllByRole("button", { name: /^Close$/ })
        .every((button) => !(button as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
