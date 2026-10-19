import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { createStore, Provider } from "jotai";
import * as client from "@/app/_trpc/client";
import * as dialog from "@/components/ui/dialog";
import * as ActivityStreakPanel from "@/layout/ActivityStreakPanel";
import ActivityStreakPopup from "@/layout/ActivityStreakPopup";
import { HuntingArrival } from "@/layout/HuntingArrival";
import * as HuntingBoard from "@/layout/HuntingBoard";
import * as Modal from "@/layout/Modal";
import * as UserContext from "@/utils/UserContext";
import * as routing from "@/utils/routing";
import { huntingContract } from "../setup/hunting";
import { actualDialog, actualModal } from "../setup/preload";

let store: ReturnType<typeof createStore>;
let isLoading: boolean;
let canClaimToday: boolean;
const storageKey = "huntingArrival:popup-hunter";
const user = { userId: "popup-hunter", occupation: "HUNTER", status: "AWAKE", sector: 1, tutorialOn: false };
const browserEvents = ["Event", "CustomEvent"] as const;
const eventDescriptors = browserEvents.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);

beforeEach(() => {
  for (const key of browserEvents) Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
  window.sessionStorage.removeItem(storageKey);
  window.localStorage.removeItem("streakPopupDismissedDateX");
  store = createStore();
  isLoading = false;
  canClaimToday = true;
  Object.assign(vi.spyOn(client, "api" as never), {
    hunting: {
      getSession: { useQuery: () => ({ data: { session: { id: "session", sector: 1, battleId: null }, contract: huntingContract() } }) },
    },
    activityStreak: {
      getUserStreaks: { useQuery: () => ({ isLoading, data: isLoading ? undefined : { streaks: [{ canClaimToday, lastClaimDate: null }] } }) },
    },
  });
  vi.spyOn(UserContext, "useRequiredUserData").mockReturnValue({ data: user } as never);
  vi.spyOn(UserContext, "useUserData").mockReturnValue({ data: user, timeDiff: 0 } as never);
  vi.spyOn(routing, "usePublicPathname").mockReturnValue("/travel");
  vi.spyOn(HuntingBoard, "HuntingBoard").mockImplementation(() => <p>Hunting preparation</p>);
  vi.spyOn(ActivityStreakPanel, "default").mockImplementation(() => <p>Reward claims</p>);
  // Keep the real dialogs even when a preceding Bun suite mocked their exports.
  vi.spyOn(Modal, "default").mockImplementation(actualModal);
  for (const key of Object.keys(actualDialog) as (keyof typeof actualDialog)[]) {
    vi.spyOn(dialog, key).mockImplementation(actualDialog[key] as never);
  }
});

afterEach(async () => {
  cleanup();
  // Radix restores focus asynchronously using the DOM's event constructors.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.restoreAllMocks();
  window.sessionStorage.removeItem(storageKey);
  window.localStorage.removeItem("streakPopupDismissedDateX");
  for (const [key, descriptor] of eventDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

// Match the shell: route children mount before the global daily-reward popup.
const shell = (blocked = false) => (
  <Provider store={store}>
    <HuntingArrival blocked={blocked} />
    <ActivityStreakPopup />
  </Provider>
);

it.each([false, true])("opens hunting after daily rewards close (initial loading: %s)", async (loading) => {
  isLoading = loading;
  const view = render(shell());
  if (loading) {
    await waitFor(() => expect(store.get(UserContext.blockingPopupOpenAtom)).toBe(true));
    expect(view.queryByRole("dialog")).toBeNull();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    isLoading = false;
    view.rerender(shell());
  }
  const daily = await view.findByRole("dialog", { name: "Daily Activity Rewards" });
  expect(view.queryByRole("dialog", { name: "Hunting encounter" })).toBeNull();
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  fireEvent.click(within(daily).getAllByRole("button", { name: "Close" })[0]!);
  await view.findByRole("dialog", { name: "Hunting encounter" });
  expect(store.get(UserContext.blockingPopupOpenAtom)).toBe(false);
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
});

it("opens hunting when daily-reward loading finishes without an eligible popup", async () => {
  isLoading = true;
  canClaimToday = false;
  const view = render(shell());
  await waitFor(() => expect(store.get(UserContext.blockingPopupOpenAtom)).toBe(true));
  expect(view.queryByRole("dialog")).toBeNull();
  isLoading = false;
  view.rerender(shell());
  await view.findByRole("dialog", { name: "Hunting encounter" });
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
});

it("still waits for travel confirmation after the global popup closes", async () => {
  const view = render(shell(true));
  const daily = await view.findByRole("dialog", { name: "Daily Activity Rewards" });
  fireEvent.click(within(daily).getAllByRole("button", { name: "Close" })[0]!);
  await waitFor(() => expect(store.get(UserContext.blockingPopupOpenAtom)).toBe(false));
  expect(view.queryByRole("dialog")).toBeNull();
  view.rerender(shell());
  await view.findByRole("dialog", { name: "Hunting encounter" });
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
});

it("preserves hunting when another arrival dialog takes focus", async () => {
  const closeOther = vi.fn();
  const arrivals = (isOpen: boolean) => (
    <Provider store={store}>
      <HuntingArrival />
      <Modal.default title="NPC arrival" isOpen={isOpen} setIsOpen={closeOther}>
        Another encounter
      </Modal.default>
    </Provider>
  );
  const view = render(arrivals(false));
  await view.findByRole("dialog", { name: "Hunting encounter" });
  view.rerender(arrivals(true));
  const other = await view.findByRole("dialog", { name: "NPC arrival" });
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  fireEvent.click(within(other).getAllByRole("button", { name: "Close" })[0]!);
  expect(closeOther).toHaveBeenCalledWith(false);
  view.rerender(arrivals(false));
  const hunting = await view.findByRole("dialog", { name: "Hunting encounter" });
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  fireEvent.click(within(hunting).getAllByRole("button", { name: "Close" })[0]!);
  expect(window.sessionStorage.getItem(storageKey)).toBe("1:session");
  expect(view.queryByRole("dialog", { name: "Hunting encounter" })).toBeNull();
});
