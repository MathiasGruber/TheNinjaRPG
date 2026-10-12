import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import * as client from "@/app/_trpc/client";
import * as select from "@/components/ui/select";
import type { Village, VillageAlliance, VillageStructure } from "@/drizzle/schema";
import * as map from "@/hooks/map";
import * as Image from "@/layout/Image";
import * as Modal from "@/layout/Modal";
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

const declare = vi.fn();
const mutation = () => ({ useMutation: () => ({ mutate: vi.fn(), isPending: false }) });
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

beforeEach(() => {
  ensureDom();
  vi.clearAllMocks();
  user = {
    userId: "leader",
    villageId: own.id,
    village: own,
    isOutlaw: false,
  } as NonNullable<UserWithRelations>;
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({}),
    travel: { getAllSectors: { useQuery: () => ({ data: [] }) } },
    village: {
      getVillageStructures: { useQuery: () => ({ data: structures }) },
      releaseSector: mutation(),
      leaveAlliance: mutation(),
      declareEnemy: mutation(),
    },
    war: {
      getRaidOptions: {
        useQuery: () => ({ data: [], isFetching: false }),
      },
      declareSectorWar: mutation(),
      declareVillageWarOrRaid: {
        useMutation: () => ({ mutate: declare, isPending: false }),
      },
    },
  });
  vi.spyOn(map, "useMap").mockReturnValue({ globe: {} as never, mapError: false });
  vi.spyOn(UserContext, "useRequiredUserData").mockImplementation(
    () => ({ data: user }) as never,
  );
  vi.spyOn(Image, "default").mockImplementation(() => <span />);
  vi.spyOn(Modal, "default").mockImplementation(
    ({
      children,
      onAccept,
      proceed_label,
      proceedDisabled,
    }: ComponentProps<typeof Modal.default>) => (
      <div role="dialog">
        {children}
        <button type="button" disabled={proceedDisabled} onClick={onAccept}>
          {proceed_label}
        </button>
      </div>
    ),
  );
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = () =>
  render(
    <WarMap
      user={user}
      isKage
      villages={[user.village!, target]}
      relationships={[
        {
          id: "enemies",
          villageIdA: own.id,
          villageIdB: target.id,
          status: "ENEMY",
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
