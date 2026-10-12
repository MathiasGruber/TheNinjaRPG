import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/api/root";
import * as client from "@/app/_trpc/client";
import type { RouterInputs, RouterOutputs } from "@/app/_trpc/client";
import HomePage from "@/app/[shell]/home/page";
import * as dialog from "@/components/ui/dialog";
import { HomeFurnitureDetails, HomeTypeDetails } from "@/drizzle/constants";
import * as sleep from "@/hooks/sleep";
import * as ContentBox from "@/layout/ContentBox";
import * as Image from "@/layout/Image";
import * as Link from "@/layout/Link";
import { getDefaultHomeLayout } from "@/libs/home";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../../setup-dom.mjs";
import { actualDialog } from "../../setup/preload";

const testApi = createTRPCReact<AppRouter>();
let savedEvent: typeof Event;
let savedCustomEvent: typeof CustomEvent;

beforeEach(() => {
  ensureDom();
  savedEvent = globalThis.Event;
  savedCustomEvent = globalThis.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  vi.spyOn(dialog, "Dialog").mockImplementation(actualDialog.Dialog);
  vi.spyOn(dialog, "DialogContent").mockImplementation(actualDialog.DialogContent);
  vi.spyOn(dialog, "DialogFooter").mockImplementation(actualDialog.DialogFooter);
  vi.spyOn(dialog, "DialogHeader").mockImplementation(actualDialog.DialogHeader);
  vi.spyOn(dialog, "DialogTitle").mockImplementation(actualDialog.DialogTitle);
  // Fresh tRPC hooks preserve real mutation lifecycles despite other suites' shared API mocks.
  Object.assign(vi.spyOn(client, "api" as never), {
    home: testApi.home,
    item: testApi.item,
    useUtils: testApi.useUtils,
  });
  vi.spyOn(UserContext, "useRequireInVillage").mockReturnValue({
    userData: {
      homeType: "NONE",
      status: "AWAKE",
      money: 1000,
      sector: 1,
      village: { sector: 1 },
    },
    access: true,
    ownVillage: true,
  } as never);
  vi.spyOn(sleep, "useSleepToggle").mockReturnValue({
    toggleSleep: vi.fn(),
    isTogglingSleep: false,
  } as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ children }) => (
    <div>{children}</div>
  ));
  vi.spyOn(Image, "default").mockImplementation(({ alt }) => <img alt={alt} />);
  vi.spyOn(Link, "default").mockImplementation(({ children, href }) => (
    <a href={String(href)}>{children}</a>
  ));
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
});
afterEach(async () => {
  cleanup();
  // Radix restores focus on a timer while unmounting its dialog.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  globalThis.Event = savedEvent;
  globalThis.CustomEvent = savedCustomEvent;
  vi.restoreAllMocks();
});

for (const success of [true, false]) {
  it(`keeps the editor disabled through refreshing a ${success ? "successful" : "rejected"} save`, async () => {
    let finishRefresh = () => {};
    const refreshed = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    let homeQueries = 0;
    const home: NonNullable<RouterOutputs["home"]["getUserHome"]> = {
      homeType: "NONE",
      regen: HomeTypeDetails.NONE.regen,
      storage: HomeTypeDetails.NONE.storage,
      furniture: { owned: [], layouts: {} },
      furnitureRevision: 3,
      layout: getDefaultHomeLayout(),
    };
    const save = vi.fn((draft: RouterInputs["home"]["saveFurnitureLayout"]) => {
      if (success) {
        home.layout = draft.placements;
        home.furnitureRevision++;
      }
      return {
        success,
        message: success ? "Saved" : "Your home changed. Refresh and try again",
      };
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const trpcClient = testApi.createClient({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              const result = async () => {
                if (op.path === "home.getUserHome") {
                  if (++homeQueries > 1) await refreshed;
                  return { ...home };
                }
                if (op.path === "home.saveFurnitureLayout")
                  return save(op.input as RouterInputs["home"]["saveFurnitureLayout"]);
                if (
                  op.path === "home.getAvailableUpgrades" ||
                  op.path === "item.getUserItems"
                )
                  return [];
                throw new Error(`Unexpected procedure ${op.path}`);
              };
              void result().then(
                (data) => {
                  observer.next({ result: { data } });
                  observer.complete();
                },
                (error) => observer.error(error),
              );
            }),
      ],
    });
    const view = render(
      <testApi.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <HomePage />
        </QueryClientProvider>
      </testApi.Provider>,
    );
    const decorate = await view.findByRole("button", { name: "Decorate" });
    fireEvent.click(decorate);
    const bed = view.getByRole("button", { name: "Move Bed" });
    fireEvent.keyDown(bed, { key: "ArrowRight" });
    const position = bed.style.left;
    fireEvent.click(view.getByRole("button", { name: "Save layout" }));
    await waitFor(() => expect(homeQueries).toBe(2));
    expect(queryClient.isMutating()).toBe(1);
    await waitFor(() =>
      expect(
        (view.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    for (const name of ["Cancel", "Move Bed right", "Reload saved layout"]) {
      expect((view.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    }
    fireEvent.keyDown(bed, { key: "ArrowRight" });
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(bed.style.left).toBe(position);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishRefresh();
      await refreshed;
    });
    if (success) {
      await waitFor(() =>
        expect(view.queryByRole("button", { name: "Move Bed" })).toBeNull(),
      );
      expect(view.getByRole("button", { name: "Bed: Go to sleep" }).style.left).toBe(
        position,
      );
    } else {
      await waitFor(() =>
        expect(
          (view.getByRole("button", { name: "Save layout" }) as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      );
      expect(view.getByRole("alert").textContent).toContain("Your home changed");
      expect(bed.style.left).toBe(position);
      fireEvent.keyDown(bed, { key: "ArrowRight" });
      expect(bed.style.left).not.toBe(position);
    }
    queryClient.clear();
  });
}

for (const lastRefresh of ["home", "profile"] as const) {
  it(`keeps decorating disabled until the purchase's ${lastRefresh} refresh finishes`, async () => {
    let finishHomeRefresh = () => {};
    const homeRefreshed = new Promise<void>((resolve) => {
      finishHomeRefresh = resolve;
    });
    let finishProfileRefresh = () => {};
    const profileRefreshed = new Promise<void>((resolve) => {
      finishProfileRefresh = resolve;
    });
    let homeQueries = 0;
    let profileQueries = 0;
    const home: NonNullable<RouterOutputs["home"]["getUserHome"]> = {
      homeType: "NONE",
      regen: HomeTypeDetails.NONE.regen,
      storage: HomeTypeDetails.NONE.storage,
      furniture: { owned: [], layouts: {} },
      furnitureRevision: 3,
      layout: getDefaultHomeLayout(),
    };
    const user = {
      homeType: "NONE",
      status: "AWAKE",
      money: HomeFurnitureDetails.rug.price * 2,
      sector: 1,
      village: { sector: 1 },
    };
    // Keep the profile query active so the page's balance invalidation also awaits a response.
    vi.spyOn(UserContext, "useRequireInVillage").mockImplementation(() => {
      const { data } = testApi.profile.getUser.useQuery();
      return { userData: data, access: true, ownVillage: true } as never;
    });
    const buy = vi.fn((input: RouterInputs["home"]["purchaseFurniture"]) => {
      home.furniture = {
        ...home.furniture,
        owned: [...home.furniture.owned, input.furnitureId],
      };
      home.furnitureRevision++;
      user.money -= HomeFurnitureDetails[input.furnitureId].price;
      return { success: true, message: "Purchased" };
    });
    const save = vi.fn((draft: RouterInputs["home"]["saveFurnitureLayout"]) => {
      const success = draft.revision === home.furnitureRevision;
      if (success) {
        home.layout = draft.placements;
        home.furnitureRevision++;
      }
      return {
        success,
        message: success ? "Saved" : "Your home changed. Refresh and try again",
      };
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const trpcClient = testApi.createClient({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              const result = async () => {
                if (op.path === "home.getUserHome") {
                  if (++homeQueries === 2) await homeRefreshed;
                  return { ...home };
                }
                if (op.path === "profile.getUser") {
                  if (++profileQueries === 2) await profileRefreshed;
                  return { ...user };
                }
                if (op.path === "home.purchaseFurniture")
                  return buy(op.input as RouterInputs["home"]["purchaseFurniture"]);
                if (op.path === "home.saveFurnitureLayout")
                  return save(op.input as RouterInputs["home"]["saveFurnitureLayout"]);
                if (
                  op.path === "home.getAvailableUpgrades" ||
                  op.path === "item.getUserItems"
                )
                  return [];
                throw new Error(`Unexpected procedure ${op.path}`);
              };
              void result().then(
                (data) => {
                  observer.next({ result: { data } });
                  observer.complete();
                },
                (error) => observer.error(error),
              );
            }),
      ],
    });
    const view = render(
      <testApi.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <HomePage />
        </QueryClientProvider>
      </testApi.Provider>,
    );
    fireEvent.click(await view.findByRole("button", { name: "House shop" }));
    const dialog = within(view.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "House Shop" })).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Buy Woven Rug" }));
    await waitFor(() => {
      expect(homeQueries).toBe(2);
      expect(profileQueries).toBe(2);
    });
    expect(buy).toHaveBeenCalledWith({ furnitureId: "rug", revision: 3 });
    fireEvent.click(dialog.getAllByRole("button", { name: "Close" })[0]!);
    const decorate = view.getByRole("button", { name: "Decorate" }) as HTMLButtonElement;
    expect(decorate.disabled).toBe(true);
    expect(queryClient.isMutating()).toBe(1);
    fireEvent.click(decorate);
    expect(view.queryByRole("button", { name: "Move Bed" })).toBeNull();

    await act(async () => {
      if (lastRefresh === "home") {
        finishProfileRefresh();
        await profileRefreshed;
      } else {
        finishHomeRefresh();
        await homeRefreshed;
      }
    });
    expect(decorate.disabled).toBe(true);
    expect(queryClient.isMutating()).toBe(1);
    await act(async () => {
      finishHomeRefresh();
      finishProfileRefresh();
      await Promise.all([homeRefreshed, profileRefreshed]);
    });
    await waitFor(() => expect(decorate.disabled).toBe(false));
    fireEvent.click(decorate);
    const bed = view.getByRole("button", { name: "Move Bed" });
    fireEvent.keyDown(bed, { key: "ArrowRight" });
    const position = bed.style.left;
    fireEvent.click(view.getByRole("button", { name: /Woven Rug.*In storage/ }));
    fireEvent.click(view.getByRole("button", { name: "Save layout" }));
    await waitFor(() =>
      expect(view.queryByRole("button", { name: "Move Bed" })).toBeNull(),
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].revision).toBe(4);
    expect(home.layout.some((placement) => placement.id === "rug")).toBe(true);
    expect(view.getByRole("button", { name: "Bed: Go to sleep" }).style.left).toBe(
      position,
    );
    expect(view.queryByRole("alert")).toBeNull();
    queryClient.clear();
  });
}
