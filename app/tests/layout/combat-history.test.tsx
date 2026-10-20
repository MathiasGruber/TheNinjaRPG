import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createTRPCReact, getQueryKey } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/api/root";
import * as client from "@/app/_trpc/client";
import type { BattleAction } from "@/drizzle/schema";
import { useCombatUpdates } from "@/hooks/combat";
import CombatHistory from "@/layout/CombatHistory";
import type { BattleState } from "@/libs/combat/types";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../setup-dom.mjs";

const testApi = createTRPCReact<AppRouter>();
let queryClient: QueryClient;
let entries: BattleAction[];
let onEvent: ((event: { version: number }) => Promise<void>) | undefined;
let readEntries: ReturnType<typeof vi.fn>;
const unsubscribe = vi.fn();
const unbind = vi.fn();
const finalState = {
  battle: { id: "battle", version: 4 }, result: { outcome: "Lost" }, isPending: false,
} as BattleState;
const lethalEntry = {
  id: "final-hit", battleId: "battle", battleRound: 1, battleVersion: 3,
  userId: "killer", actionId: "basicAttack", description: "Killer strikes Victim",
  appliedEffects: [{ txt: "Victim takes 100 damage", color: "red" }],
  createdAt: new Date(), updatedAt: new Date(),
} as BattleAction;

beforeEach(() => {
  ensureDom();
  entries = [];
  onEvent = undefined;
  unsubscribe.mockClear();
  unbind.mockClear();
  queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  readEntries = vi.fn((): BattleAction[] | Promise<BattleAction[]> => entries);
  Object.assign(vi.spyOn(client, "api" as never), { combat: testApi.combat, useUtils: testApi.useUtils });
  const user = { data: { userId: "victim", role: "USER", showBattleDescription: true },
    pusher: { subscribe: () => ({ bind: (_event: string, handler: typeof onEvent) => { onEvent = handler; }, unbind }), unsubscribe } };
  vi.spyOn(UserContext, "useUserData").mockReturnValue(user as never);
  vi.spyOn(UserContext, "useRequiredUserData").mockReturnValue(user as never);
});
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });

const History = ({ state, listen }: { state: BattleState; listen: boolean }) => {
  useCombatUpdates(listen ? state : { battle: null, result: null, isPending: false });
  return <CombatHistory battleId="battle" battleVersion={listen ? state.battle?.version : undefined} results={state.result} />;
};

const mount = (listen = true, state = finalState) => {
  const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
    if (op.path !== "combat.getBattleEntries") throw new Error(`Unexpected procedure ${op.path}`);
    void Promise.resolve(readEntries()).then((data) => { observer.next({ result: { data } }); observer.complete(); });
  })] });
  return render(<testApi.Provider client={trpcClient} queryClient={queryClient}><QueryClientProvider client={queryClient}><History state={state} listen={listen} /></QueryClientProvider></testApi.Provider>);
};

it.each([4, 3, 5])("recovers a lethal hit inserted after settlement, on websocket version %s", async (version) => {
  const battleKey = getQueryKey(testApi.combat.getBattle, { battleId: "battle" }, "query");
  const otherKey = getQueryKey(testApi.combat.getBattleEntries, { battleId: "other" }, "query");
  queryClient.setQueryData(battleKey, finalState);
  queryClient.setQueryData(otherKey, []);
  const view = mount();
  await waitFor(() => expect(readEntries).toHaveBeenCalledTimes(1));
  expect(view.queryByText(/Victim takes/)).toBeNull();
  entries = [lethalEntry];
  await act(async () => { await onEvent?.({ version }); });
  await view.findByText(/Victim takes 100 damage/);
  expect(queryClient.getQueryState(battleKey)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  view.unmount();
  expect(unbind).toHaveBeenCalledWith("event", expect.any(Function));
  expect(unsubscribe).toHaveBeenCalledWith("battle");
});

it("refreshes a cached saved log when it is reopened after the final insert", async () => {
  const view = mount(false);
  await waitFor(() => expect(readEntries).toHaveBeenCalledTimes(1));
  view.unmount();
  entries = [lethalEntry];
  const reopened = mount(false);
  await reopened.findByText(/Victim takes 100 damage/);
  expect(readEntries).toHaveBeenCalledTimes(2);
});

it("discards a saved log's pre-insert request when reopened before it finishes", async () => {
  let finishOldRead!: (rows: BattleAction[]) => void;
  const oldResponse = new Promise<BattleAction[]>((resolve) => { finishOldRead = resolve; });
  readEntries.mockImplementationOnce(() => oldResponse);
  const state = { ...finalState, result: null };
  const view = mount(false, state);
  await waitFor(() => expect(readEntries).toHaveBeenCalledTimes(1));
  view.unmount();
  entries = [lethalEntry];
  const reopened = mount(false, state);
  await act(async () => { finishOldRead([]); });
  await reopened.findByText(/Victim takes 100 damage/);
  expect(readEntries).toHaveBeenCalledTimes(2);
});

it("discards an in-flight pre-insert history response when the final event arrives", async () => {
  let finishOldRead!: (rows: BattleAction[]) => void;
  const oldResponse = new Promise<BattleAction[]>((resolve) => { finishOldRead = resolve; });
  readEntries.mockImplementationOnce(() => oldResponse);
  const view = mount();
  await waitFor(() => expect(readEntries).toHaveBeenCalledTimes(1));
  entries = [lethalEntry];
  await act(async () => { await onEvent?.({ version: 4 }); });
  await view.findByText(/Victim takes 100 damage/);
  await act(async () => { finishOldRead([]); });
  expect(view.getByText(/Victim takes 100 damage/)).toBeTruthy();
  expect(readEntries).toHaveBeenCalledTimes(2);
});

it("still refreshes live battle state for a newer action", async () => {
  const state = { ...finalState, result: null };
  const battleKey = getQueryKey(testApi.combat.getBattle, { battleId: "battle" }, "query");
  queryClient.setQueryData(battleKey, state);
  mount(true, state);
  await waitFor(() => expect(readEntries).toHaveBeenCalledTimes(1));
  await act(async () => { await onEvent?.({ version: 5 }); });
  await waitFor(() => expect(queryClient.getQueryState(battleKey)?.isInvalidated).toBe(true));
});
