import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as dynamic from "next/dynamic";
import * as client from "@/app/_trpc/client";
import * as building from "@/layout/Building";
import * as image from "@/layout/Image";
import * as panel from "@/layout/ObjectiveWarPanel";
import type { UserWithRelations } from "@/routers/profile";
import type { FetchActiveWarsReturnType } from "@/routers/war";
import { defaultWarRules } from "@/validators/war";
import { ensureDom } from "../setup-dom.mjs";

vi.spyOn(dynamic, "default").mockImplementation(() => (() => null) as never);
const { VillageWar } = await import("@/layout/WarSystem");

const war = {
  id: "objective-war",
  type: "VILLAGE_WAR",
  status: "ACTIVE",
  rules: defaultWarRules,
  attackerVillageId: "attacker",
  defenderVillageId: "defender",
  warAllies: [
    {
      villageId: "attacker-ally",
      supportVillageId: "attacker",
      village: { name: "Attacking ally" },
    },
    {
      villageId: "defender-ally",
      supportVillageId: "defender",
      village: { name: "Defending ally" },
    },
  ],
  attackerVillage: {
    id: "attacker",
    name: "Attacker",
    structures: [{ route: "/townhall" }],
  },
  defenderVillage: {
    id: "defender",
    name: "Defender",
    structures: [{ route: "/townhall" }],
  },
  startedAt: new Date(),
  lastTokenReductionAt: new Date(),
  targetStructureRoute: "/townhall",
  attackerWarHealth: 10000,
  defenderWarHealth: 10000,
  attackerWarHealthMax: 10000,
  defenderWarHealthMax: 10000,
} as FetchActiveWarsReturnType;
const freshWar = { ...war, attackerWarHealth: 9700, defenderWarHealth: 8200 };
let response: FetchActiveWarsReturnType | undefined;

beforeEach(() => {
  ensureDom();
  response = undefined;
  const mutation = {
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({}),
    war: {
      getObjectiveWarInfo: {
        useQuery: () => ({ data: response ? { war: response } : undefined }),
      },
      getWarKills: { useQuery: () => ({}) },
      getWarKillStats: { useQuery: () => ({}) },
      getAllyOffers: { useQuery: () => ({ data: [] }) },
      acceptAllyOffer: mutation,
      rejectAllyOffer: mutation,
      cancelAllyOffer: mutation,
      createAllyOffer: mutation,
      surrender: mutation,
      adminEndWar: mutation,
    },
  });
  vi.spyOn(panel, "ObjectiveWarPanel").mockImplementation(() => null);
  vi.spyOn(building, "default").mockImplementation(() => null);
  vi.spyOn(image, "default").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const expectHealth = (view: ReturnType<typeof render>, health: number[]) => {
  const labels = view.getAllByText(/^HP \(/);
  expect(labels.map((label) => label.textContent)).toEqual(
    health.map((current) => `HP (${current} / 10000)`),
  );
  expect(
    labels.map(
      (label) =>
        (label.parentElement?.querySelector(".bg-red-500") as HTMLElement).style.width,
    ),
  ).toEqual(health.map((current) => `${(current / 10000) * 100}%`));
};

describe("objective war townhall health", () => {
  const viewers = [
    ["attacker", true],
    ["attacker-ally", true],
    ["defender", false],
    ["defender-ally", false],
  ] as const;

  it.each(viewers)(
    "shows the latest initial snapshot to %s",
    (villageId, isAttacker) => {
      response = freshWar;
      const user = { userId: "viewer", villageId, role: "USER" } as NonNullable<
        UserWithRelations
      >;
      const view = render(<VillageWar war={war} user={user} isKage={false} />);
      expectHealth(view, isAttacker ? [9700, 8200] : [8200, 9700]);
    },
  );

  it.each(viewers)(
    "refreshes visible health after polling for %s",
    (villageId, isAttacker) => {
      const user = { userId: "viewer", villageId, role: "USER" } as NonNullable<
        UserWithRelations
      >;
      const view = render(<VillageWar war={war} user={user} isKage={false} />);
      expectHealth(view, [10000, 10000]);

      response = freshWar;
      view.rerender(<VillageWar war={war} user={user} isKage={false} />);
      expectHealth(view, isAttacker ? [9700, 8200] : [8200, 9700]);

      response = { ...freshWar, attackerWarHealth: 9740, defenderWarHealth: 7900 };
      view.rerender(<VillageWar war={war} user={user} isKage={false} />);
      expectHealth(view, isAttacker ? [9740, 7900] : [7900, 9740]);
    },
  );
});
