import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "bun:test";
import * as dynamic from "next/dynamic";
import * as navigation from "next/navigation";
import * as client from "@/app/_trpc/client";
import type { RouterOutputs } from "@/app/_trpc/client";
import * as preferences from "@/hooks/combat";
import * as tutorial from "@/hooks/tutorial";
import type { BattleState } from "@/libs/combat/types";
import * as userContext from "@/utils/UserContext";
import { ensureDom } from "../../setup-dom.mjs";
import { makeCompleteBattle, makeUser } from "../../libs/combat/helpers/battleScenario";
import { dungeonBattleState } from "../../setup/dungeon";

// Keep the real page and query lifecycles, substituting only its WebGL scene.
const scene = vi.spyOn(dynamic, "default").mockReturnValue(
  (({ battleState }: { battleState: BattleState }) => (
    <p>{battleState.result ? "Finished battle result" : `Active battle ${battleState.battle?.id}`}</p>
  )) as never,
);
const { default: CombatPage } = await import("@/app/[shell]/combat/page");
scene.mockRestore();

type Response = RouterOutputs["combat"]["getBattle"];
const empty: Response = { battle: null, result: null };
const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((queryClient) => queryClient.clear());
  vi.restoreAllMocks();
});

const mount = (battleId: string | null, read: (id: string) => Promise<Response>) => {
  ensureDom();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(queryClient);
  let profile = { userId: "player", status: battleId ? "BATTLE" : "AWAKE", battleId, userQuests: [] };
  const invalidate = vi.fn(async () => undefined);
  const push = vi.fn();
  const utils = { profile: { getUser: { invalidate } }, combat: { getBattle: { invalidate: vi.fn() } } };
  vi.spyOn(navigation, "useRouter").mockReturnValue({ push } as never);
  vi.spyOn(userContext, "useRequiredUserData").mockImplementation(() => ({ data: profile }) as never);
  vi.spyOn(preferences, "useCombatPreferences").mockReturnValue({
    useTabs: false, layoutOrder: ["battlefield"], showTimeline: false, showBattleLog: false,
  } as never);
  vi.spyOn(tutorial, "useTutorialStep").mockReturnValue({ handleNextStep: vi.fn() } as never);
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => utils,
    combat: {
      getBattle: { useQuery: (input: { battleId?: string | null }, options: object) => useQuery({
        ...options, queryKey: ["combat", input.battleId], queryFn: () => read(input.battleId!),
      }) },
      toggleAutoCombat: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  });
  const tree = () => <QueryClientProvider client={queryClient}><CombatPage /></QueryClientProvider>;
  const view = render(tree());
  return { view, invalidate, push, queryClient, changeBattle: (id: string | null) => {
    profile = { ...profile, battleId: id, status: id ? "BATTLE" : "AWAKE" };
    view.rerender(tree());
  } };
};

it("recovers a settled battle missing behind a cached character ID", async () => {
  const { view, invalidate, push } = mount("settled", async () => empty);
  await waitFor(() => expect(view.getByText("You are not in an active battle.")).toBeDefined());
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(view.getByRole("link", { name: "Return to Profile" }).getAttribute("href")).toBe("/profile");
  expect(push).not.toHaveBeenCalled();
});

it("offers a return path when the character has no battle, without querying", () => {
  const read = vi.fn(async () => empty);
  const { view, invalidate } = mount(null, read);
  expect(view.getByRole("link", { name: "Return to Profile" })).toBeDefined();
  expect(read).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});

it("waits for a real response before declaring an active battle missing", async () => {
  let resolve!: (value: Response) => void;
  const { view, invalidate } = mount("pending", () => new Promise((r) => { resolve = r; }));
  expect(view.getByText("Loading Battle Data")).toBeDefined();
  expect(view.queryByRole("link", { name: "Return to Profile" })).toBeNull();
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => resolve(empty));
  await waitFor(() => expect(view.getByRole("link", { name: "Return to Profile" })).toBeDefined());
});

it("retries a failed lookup without treating the failure as a settled battle", async () => {
  let fails = true;
  const read = vi.fn(async () => { if (fails) throw new Error("Offline"); return empty; });
  const { view, invalidate } = mount("retry", read);
  await waitFor(() => expect(view.getByRole("alert").textContent).toContain("Unable to load"));
  expect(invalidate).not.toHaveBeenCalled();
  expect(view.queryByText("You are not in an active battle.")).toBeNull();
  fails = false;
  fireEvent.click(view.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(view.getByRole("link", { name: "Return to Profile" })).toBeDefined());
  expect(read).toHaveBeenCalledTimes(2);
});

it("does not let a late missing response for A replace a pending battle B", async () => {
  const resolvers = new Map<string, (value: Response) => void>();
  const { view, changeBattle, invalidate } = mount("a", (id) => new Promise((r) => { resolvers.set(id, r); }));
  changeBattle("b");
  await act(async () => resolvers.get("a")!(empty));
  expect(view.getByText("Loading Battle Data")).toBeDefined();
  expect(view.queryByText("You are not in an active battle.")).toBeNull();
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => resolvers.get("b")!(empty));
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
});

it("keeps an already displayed result when a later lookup or profile loses its battle", async () => {
  const battle = makeCompleteBattle({ id: "finished", usersState: [makeUser({ userId: "player" })] });
  const finished = { battle, result: { outcome: "Won" } } as unknown as Response;
  const { view, queryClient, changeBattle, invalidate } = mount("finished", async () => finished);
  await waitFor(() => expect(view.getByText("Finished battle result")).toBeDefined());
  await act(async () => queryClient.setQueryData(["combat", "finished"], empty));
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  changeBattle(null);
  expect(view.getByText("Finished battle result")).toBeDefined();
  expect(view.queryByRole("link", { name: "Return to Profile" })).toBeNull();
});

it("preserves dungeon recovery when a different member settles its battle", async () => {
  const battle = makeCompleteBattle({
    id: "dungeon-battle", usersState: [makeUser({ userId: "player" })],
    extraState: { dungeon: dungeonBattleState() },
  });
  const active = { battle, result: null } as unknown as Response;
  const { view, queryClient, push, invalidate } = mount("dungeon-battle", async () => active);
  await waitFor(() => expect(view.getByText("Active battle dungeon-battle")).toBeDefined());
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => queryClient.setQueryData(["combat", "dungeon-battle"], empty));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/dungeon"));
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(view.queryByText("Active battle dungeon-battle")).toBeNull();
});
