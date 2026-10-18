import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as dialogComponents from "@/components/ui/dialog";
import TutorialAssistant from "@/layout/TutorialAssistant";
import type { UserWithRelations } from "@/server/api/routers/profile";
import { type UserPatch, updateUserCache } from "@/utils/userCache";
import { ensureDom } from "../setup-dom.mjs";

const key = [["profile", "getUser"], { type: "query" }];
const profile = (money = 100, userId = "actor", tutorialOn = true) => ({
  userData: { userId, money, tutorialOn, tutorialStep: 0, status: "AWAKE", level: 2 } as NonNullable<UserWithRelations>,
});
function testMocks() {
  const globals = globalThis as typeof globalThis & { __tutorialAssistantMocks?: {
    client: QueryClient;
    disable: ReturnType<typeof vi.fn<() => Promise<{ success: boolean; message: string }>>>;
    updateUser: ReturnType<typeof vi.fn<(patch: UserPatch) => Promise<void>>>;
    rewardHook: ReturnType<typeof vi.fn>;
    pathname: string;
    push: ReturnType<typeof vi.fn>;
    replace: ReturnType<typeof vi.fn>;
    updateTutorialStep: ReturnType<typeof vi.fn>;
  } };
  globals.__tutorialAssistantMocks ??= {
    client: new QueryClient(),
    disable: vi.fn(async () => ({ success: true, message: "Saved" })),
    updateUser: vi.fn(async (patch: UserPatch) => { await updateUserCache(testMocks().client, key, patch); }),
    rewardHook: vi.fn(),
    pathname: "/profile",
    push: vi.fn(),
    replace: vi.fn(),
    updateTutorialStep: vi.fn(),
  };
  return globals.__tutorialAssistantMocks;
}
const mocks = testMocks();
vi.mock("@/utils/UserContext", () => ({
  useUserData: () => ({ data: testMocks().client.getQueryData<ReturnType<typeof profile>>(key)?.userData, updateUser: testMocks().updateUser }),
}));
vi.mock("@/app/_trpc/client", () => ({ api: {
  useUtils: () => ({ profile: { getUser: {
    cancel: () => testMocks().client.cancelQueries({ queryKey: key, exact: true }),
    setData: (_input: unknown, updater: (old: ReturnType<typeof profile> | undefined) => ReturnType<typeof profile> | undefined) => testMocks().client.setQueryData(key, updater),
  } } }),
  profile: { updatePreferences: { useMutation: () => ({ mutateAsync: testMocks().disable }) } },
  gameAsset: { getSceneAssets: { useQuery: () => ({ data: [] }) } },
} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: testMocks().push, replace: testMocks().replace }) }));
vi.mock("@/utils/routing", () => ({ usePublicPathname: () => testMocks().pathname }));
vi.mock("@/hooks/tutorial", () => {
  const step = { id: "welcome", title: "Welcome", description: "Welcome", page: "/profile" };
  return { TUTORIAL_STEPS: [step], TUTORIAL_HOSPITALIZED_STEP: step, useTutorialStep: () => ({ currentStep: step, currentStepNumber: 0, isAssistantVisible: true, setIsAssistantVisible: vi.fn(), updateTutorialStep: testMocks().updateTutorialStep }) };
});
vi.mock("@/hooks/useAbVariant", () => ({ useAbVariant: () => ({ variant: "A" }) }));
vi.mock("@/layout/Logbook", () => ({ useCheckRewards: () => {
  testMocks().rewardHook();
  return { checkRewards: vi.fn(), isCheckingRewards: false };
} }));
vi.mock("@/layout/Image", () => ({ default: () => null }));
vi.mock("@/layout/Objective", () => ({ Objective: () => null }));
vi.mock("@/components/ui/sortable-list", () => ({ SortableList: () => null }));
const dialogContent = ({ children }: { children: ReactNode }) => <div>{children}</div>;
const dialogMocks = { Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div role="dialog">{children}</div> : null, DialogContent: dialogContent, DialogDescription: dialogContent, DialogHeader: dialogContent, DialogTitle: dialogContent };
const dialogSpies: { mockRestore: () => void }[] = [];

let close: (() => void) | undefined;
const animationFrame = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
beforeEach(() => {
  ensureDom();
  for (const [name, implementation] of Object.entries(dialogMocks)) {
    dialogSpies.push(vi.spyOn(dialogComponents, name as keyof typeof dialogMocks).mockImplementation(implementation as never));
  }
  vi.clearAllMocks();
  mocks.pathname = "/profile";
  mocks.client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.client.setQueryData(key, profile());
  mocks.disable.mockResolvedValue({ success: true, message: "Saved" });
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: () => 0 });
});
afterEach(() => {
  cleanup();
  for (const spy of dialogSpies.splice(0)) spy.mockRestore();
  close?.();
  close = undefined;
  mocks.client.clear();
  if (animationFrame) Object.defineProperty(globalThis, "requestAnimationFrame", animationFrame);
  else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
});
const renderAssistant = () => render(<TutorialAssistant rightSideBarOpen={false} setRightSideBarOpen={() => {}} rightSideBarRef={{ current: null }} />);
const confirmDisable = (view: ReturnType<typeof renderAssistant>) => {
  fireEvent.click(view.getByRole("button", { name: "Disable tutorial" }));
  fireEvent.click(view.getByRole("button", { name: "Skip Tutorial" }));
};
const observe = (queryFn: () => Promise<ReturnType<typeof profile>>) => {
  const observer = new QueryObserver(mocks.client, { queryKey: key, staleTime: Infinity, queryFn });
  close = observer.subscribe(() => {});
};

describe("TutorialAssistant account boundary", () => {
  it("does not mount login-required reward hooks for signed-out visitors", () => {
    mocks.client.removeQueries({ queryKey: key });
    const view = renderAssistant();
    expect(view.container.innerHTML).toBe("");
    expect(mocks.rewardHook).not.toHaveBeenCalled();
  });

  it("mounts after a profile arrives and unmounts when it disappears", () => {
    mocks.client.removeQueries({ queryKey: key });
    const view = renderAssistant();
    expect(mocks.rewardHook).not.toHaveBeenCalled();

    mocks.client.setQueryData(key, profile());
    view.rerender(<TutorialAssistant rightSideBarOpen={false} setRightSideBarOpen={() => {}} rightSideBarRef={{ current: null }} />);
    expect(mocks.rewardHook).toHaveBeenCalled();
    expect(view.getByRole("button", { name: "Disable tutorial" })).toBeTruthy();

    mocks.rewardHook.mockClear();
    mocks.client.removeQueries({ queryKey: key });
    view.rerender(<TutorialAssistant rightSideBarOpen={false} setRightSideBarOpen={() => {}} rightSideBarRef={{ current: null }} />);
    expect(view.container.innerHTML).toBe("");
    expect(mocks.rewardHook).not.toHaveBeenCalled();
  });
});

describe("TutorialAssistant reference pages", () => {
  it.each(["/guide", "/guide/getting-started", "/rules", "/help"])(
    "leaves %s readable without changing the tutorial",
    (pathname) => {
      mocks.pathname = pathname;
      const view = renderAssistant();
      expect(view.container.innerHTML).toBe("");
      expect(mocks.rewardHook).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.updateTutorialStep).not.toHaveBeenCalled();
      expect(mocks.client.getQueryData<ReturnType<typeof profile>>(key)).toEqual(profile());
    },
  );

  it("resumes the same step when returning to its page", () => {
    const view = renderAssistant();
    mocks.pathname = "/guide";
    view.rerender(<TutorialAssistant rightSideBarOpen={false} setRightSideBarOpen={() => {}} rightSideBarRef={{ current: null }} />);
    expect(view.container.innerHTML).toBe("");
    mocks.pathname = "/profile";
    view.rerender(<TutorialAssistant rightSideBarOpen={false} setRightSideBarOpen={() => {}} rightSideBarRef={{ current: null }} />);
    expect(view.getByRole("button", { name: "Disable tutorial" })).toBeTruthy();
    expect(mocks.client.getQueryData<ReturnType<typeof profile>>(key)).toEqual(profile());
  });

  it.each(["/village", "/guide/edit/article"])(
    "keeps the tutorial redirect on %s",
    (pathname) => {
      mocks.pathname = pathname;
      renderAssistant();
      expect(mocks.push).toHaveBeenCalledWith("/profile");
    },
  );
});

describe("TutorialAssistant disable reconciliation", () => {
  it("keeps an idle success fetch-free and closes the confirmation", async () => {
    const read = vi.fn(async () => profile(200, "actor", false));
    observe(read);
    const view = renderAssistant();
    confirmDisable(view);
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
    expect(mocks.client.getQueryData<ReturnType<typeof profile>>(key)).toEqual(profile(100, "actor", false));
    expect(read).not.toHaveBeenCalled();
  });

  it("restarts an unrelated pending profile refresh", async () => {
    const read = vi.fn<() => Promise<ReturnType<typeof profile>>>().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(profile(200, "actor", false));
    observe(read);
    const pending = mocks.client.invalidateQueries({ queryKey: key });
    expect(mocks.client.getQueryState(key)?.fetchStatus).toBe("fetching");
    const view = renderAssistant();
    confirmDisable(view);
    await waitFor(() => expect(mocks.client.getQueryData<ReturnType<typeof profile>>(key)).toEqual(profile(200, "actor", false)));
    await pending;
    expect(read).toHaveBeenCalledTimes(2);
    expect(view.queryByRole("dialog")).toBeNull();
  });

  it("preserves invalidated idle profile reconciliation", async () => {
    const read = vi.fn(async () => profile(200, "actor", false));
    observe(read);
    await mocks.client.invalidateQueries({ queryKey: key, refetchType: "none" });
    const view = renderAssistant();
    confirmDisable(view);
    await waitFor(() => expect(mocks.client.getQueryData<ReturnType<typeof profile>>(key)).toEqual(profile(200, "actor", false)));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("ignores a successful response after switching accounts", async () => {
    let resolve!: (result: { success: boolean; message: string }) => void;
    mocks.disable.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = renderAssistant();
    confirmDisable(view);
    mocks.client.setQueryData(key, profile(300, "other"));
    view.rerender(<TutorialAssistant rightSideBarOpen={false} setRightSideBarOpen={() => {}} rightSideBarRef={{ current: null }} />);
    await act(async () => { resolve({ success: true, message: "Saved" }); });
    expect(mocks.client.getQueryData<ReturnType<typeof profile>>(key)).toEqual(profile(300, "other"));
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(view.getByRole("button", { name: "Skip Tutorial" })).toBeTruthy();
  });
});
