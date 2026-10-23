import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import * as navigation from "next/navigation";
import type { ReactNode } from "react";
import * as client from "@/app/_trpc/client";
import * as ContentBox from "@/layout/ContentBox";
import { HuntingArrival } from "@/layout/HuntingArrival";
import { HuntingBoard } from "@/layout/HuntingBoard";
import * as Modal from "@/layout/Modal";
import { optimisticGlobalTravelStart } from "@/libs/travel";
import * as UserContext from "@/utils/UserContext";
import { huntingContract, huntingHabitatContent } from "../setup/hunting";

const now = new Date();
const session = { content: huntingHabitatContent(), id: "session", habitatId: "forest", contractId: "contract", sector: 1, readyAt: null, battleId: null, version: 0 };
let user: { userId: string; occupation: string; sector: number; status: string };
let currentSession: typeof session | null;
let boardSession: typeof session | null;

beforeEach(() => {
  window.sessionStorage.removeItem("huntingArrival:hunter");
  window.sessionStorage.removeItem("huntingArrival:another-hunter");
  user = { userId: "hunter", occupation: "HUNTER", sector: 2, status: "AWAKE" };
  currentSession = null;
  boardSession = null;
  const board = {
    user: { ...user, huntingExperience: 123 }, session: null, progress: [], serverTime: now,
    habitats: [
      { id: "forest", content: huntingHabitatContent() },
      { id: "desert", content: { ...huntingHabitatContent(), name: "Desert", contracts: [{ ...huntingContract(), id: "lizard", name: "Lizard hunt", aiId: "lizard", rank: "C RANK", rewards: [{ itemId: "scales", quantity: 1, chance: 100 }] }] } },
    ],
    creatures: [{ userId: "enemy", username: "Boar", level: 10 }, { userId: "lizard", username: "Lizard", level: 20 }],
    materials: [{ id: "hide", name: "Boar hide" }, { id: "scales", name: "Lizard scales" }],
  };
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({}),
    hunting: {
      getBoard: { useQuery: () => ({ data: { ...board, session: boardSession }, isLoading: false }) },
      getSession: { useQuery: () => ({ data: currentSession ? { session: currentSession, contract: huntingContract() } : null }) },
      accept: { useMutation: () => ({}) }, sessionAction: { useMutation: () => ({}) }, start: { useMutation: () => ({}) },
    },
  });
  vi.spyOn(navigation, "useRouter").mockReturnValue({ push: vi.fn() } as never);
  vi.spyOn(UserContext, "useUserData").mockReturnValue({ updateUser: vi.fn() } as never);
  vi.spyOn(UserContext, "useRequiredUserData").mockImplementation(() => ({ data: user }) as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ children }: { children: ReactNode }) => <div>{children}</div>);
  vi.spyOn(Modal, "default").mockImplementation(({ isOpen, children, setIsOpen }: { isOpen: boolean; children: ReactNode; setIsOpen: (open: boolean) => void }) => isOpen ? <div role="dialog"><button onClick={() => setIsOpen(false)}>Dismiss</button>{children}</div> : null);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("hides nonmatching habitats and combines rank, creature and material filters", () => {
  const view = render(<HuntingBoard />);
  expect(view.getByRole("heading", { name: "Forest" })).toBeTruthy();
  expect(view.getByRole("heading", { name: "Desert" })).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "C RANK" }));
  expect(view.queryByRole("heading", { name: "Forest" })).toBeNull();
  expect(view.getByRole("heading", { name: "Lizard hunt" })).toBeTruthy();
  fireEvent.change(view.getByLabelText("Material filter"), { target: { value: "  SCALES  " } });
  expect(view.getByRole("heading", { name: "Desert" })).toBeTruthy();
  fireEvent.change(view.getByLabelText("Creature filter"), { target: { value: "boar" } });
  expect(view.queryByRole("heading", { name: "Desert" })).toBeNull();
  expect(view.getAllByText("No contracts match these filters.")).toHaveLength(1);
  fireEvent.click(view.getByRole("button", { name: "All ranks" }));
  fireEvent.change(view.getByLabelText("Material filter"), { target: { value: "" } });
  expect(view.getByRole("heading", { name: "Forest" })).toBeTruthy();
  expect(view.queryByRole("heading", { name: "Desert" })).toBeNull();
});

it("renders accepted terms independently of the updated contract board", () => {
  boardSession = { ...session, content: { ...huntingHabitatContent(), name: "Accepted forest", contracts: [{ ...huntingContract(), name: "Original boar", hunts: 7, preparationSeconds: 15 }] } };
  user.sector = 1;
  const view = render(<HuntingBoard />);
  expect(view.getByRole("heading", { name: "Original boar" })).toBeTruthy();
  expect(view.getByText("7 / 7 successful hunts remaining")).toBeTruthy();
  expect(view.getByRole("button", { name: "Prepare (15s)" })).toBeTruthy();
  expect(view.getByRole("heading", { name: "Forest boar" })).toBeTruthy();
});

it("opens on arrival, stays dismissed across refreshes, and reopens on the next arrival", () => {
  currentSession = session;
  const view = render(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
  user = { ...user, sector: 1 };
  view.rerender(<HuntingArrival />);
  expect(view.getByRole("dialog")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Open hunting contract" }));
  expect(view.getByRole("dialog")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
  user = { ...user, sector: 2 };
  view.rerender(<HuntingArrival />);
  user = { ...user, sector: 1, status: "TRAVEL" };
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
  user = { ...user, status: "AWAKE" };
  view.rerender(<HuntingArrival />);
  expect(view.getByRole("dialog")).toBeTruthy();
  currentSession = null;
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
});


it("preserves dismissal across remounts, loading and same-sector combat", () => {
  currentSession = session;
  user = { ...user, sector: 1 };
  const first = render(<HuntingArrival />);
  fireEvent.click(first.getByRole("button", { name: "Dismiss" }));
  first.unmount();
  currentSession = null;
  const view = render(<HuntingArrival />);
  currentSession = session;
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
  user = { ...user, status: "BATTLE" };
  view.rerender(<HuntingArrival />);
  user = { ...user, status: "AWAKE" };
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
  user = { ...user, userId: "another-hunter" };
  view.rerender(<HuntingArrival />);
  expect(view.getByRole("dialog")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
  user = { ...user, userId: "hunter" };
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
});

it.each([
  { outcome: "is rejected", travelSeconds: 12, isLoading: false },
  { outcome: "fails with a network error", travelSeconds: 0, isLoading: true },
])("preserves dismissal when optimistic travel $outcome", ({ travelSeconds, isLoading }) => {
  currentSession = session;
  user = { ...user, sector: session.sector };
  const view = render(<HuntingArrival />);
  fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
  const savedDismissal = window.sessionStorage.getItem("huntingArrival:hunter");

  // startGlobalMove retains the sector until admission succeeds. Both rejection
  // and onError restore the previous status without changing the sector.
  const previousStatus = user.status;
  if (isLoading) currentSession = null;
  user = { ...user, ...optimisticGlobalTravelStart(travelSeconds) };
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
  expect(window.sessionStorage.getItem("huntingArrival:hunter")).toBe(savedDismissal);
  user = { ...user, status: previousStatus };
  view.rerender(<HuntingArrival />);
  currentSession = session;
  view.rerender(<HuntingArrival />);
  expect(view.queryByRole("dialog")).toBeNull();
  view.unmount();
  expect(render(<HuntingArrival />).queryByRole("dialog")).toBeNull();
});

it.each([0, 12])("resets dismissal on confirmed departure with a %i-second trip while the session loads", (travelSeconds) => {
  currentSession = session;
  user = { ...user, sector: session.sector };
  const first = render(<HuntingArrival />);
  fireEvent.click(first.getByRole("button", { name: "Dismiss" }));
  first.unmount();
  currentSession = null;
  const departing = render(<HuntingArrival />);
  user = { ...user, ...optimisticGlobalTravelStart(travelSeconds) };
  departing.rerender(<HuntingArrival />);
  // Successful admission supplies the destination sector before travel finishes.
  user = { ...user, sector: 2 };
  departing.rerender(<HuntingArrival />);
  expect(window.sessionStorage.getItem("huntingArrival:hunter")).toBe("");
  departing.unmount();
  const view = render(<HuntingArrival />);
  user = { ...user, sector: session.sector };
  view.rerender(<HuntingArrival />);
  user = { ...user, status: "AWAKE" };
  view.rerender(<HuntingArrival />);
  currentSession = session;
  view.rerender(<HuntingArrival />);
  expect(view.getByRole("dialog")).toBeTruthy();
});
