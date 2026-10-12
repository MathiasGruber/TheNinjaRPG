import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact, getQueryKey } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/api/root";
import * as client from "@/app/_trpc/client";
import type { RouterInputs, RouterOutputs } from "@/app/_trpc/client";
import HomePage from "@/app/[shell]/home/page";
import * as dialog from "@/components/ui/dialog";
import { HomeTypeDetails } from "@/drizzle/constants";
import * as sleep from "@/hooks/sleep";
import * as ContentBox from "@/layout/ContentBox";
import * as Image from "@/layout/Image";
import * as Link from "@/layout/Link";
import * as Modal from "@/layout/Modal";
import { getDefaultHomeLayout, type HomeFurniture } from "@/libs/home";
import * as Shop from "@/layout/Shop";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../../setup-dom.mjs";
import { actualDialog, actualModal } from "../../setup/preload";

const furniture: HomeFurniture[] = [{
  id: "owned-bed", itemId: "home-bed", name: "Bed", description: "Rest", image: "/images/home/furniture/bed.webp", width: 34, groundAnchor: 91.1, action: "sleep", isFloor: false, quantity: 1,
}];
const rug: HomeFurniture = {
  id: "owned-rug", itemId: "custom-rug", name: "Woven Rug", description: "A floor decoration", image: "/custom-rug.webp", width: 25, groundAnchor: 88.5, action: null, isFloor: true, quantity: 1,
};

const testApi = createTRPCReact<AppRouter>();
let savedEvent: typeof Event;
let savedCustomEvent: typeof CustomEvent;

beforeEach(() => {
  ensureDom();
  savedEvent = globalThis.Event;
  savedCustomEvent = globalThis.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  vi.spyOn(Modal, "default").mockImplementation(actualModal);
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
  vi.spyOn(Shop, "default").mockImplementation(() => <p>Furniture catalog</p>);
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
      furniture,
      furnitureRevision: 3,
      layout: getDefaultHomeLayout(furniture),
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

// Real dialog focus, lazy catalog loading and query refresh need an integration-test budget.
it("opens the standard furniture catalog and waits for refreshed inventory before decorating", async () => {
  let finishRefresh = () => {};
  const refreshed = new Promise<void>((resolve) => { finishRefresh = resolve; });
  let homeQueries = 0;
  const home: NonNullable<RouterOutputs["home"]["getUserHome"]> = {
    homeType: "NONE", regen: HomeTypeDetails.NONE.regen, storage: HomeTypeDetails.NONE.storage,
    furniture: [...furniture], furnitureRevision: 3, layout: getDefaultHomeLayout(furniture),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
    const result = async () => {
      if (op.path === "home.getUserHome") {
        if (++homeQueries > 1) await refreshed;
        return { ...home };
      }
      if (op.path === "home.getAvailableUpgrades" || op.path === "item.getUserItems") return [];
      throw new Error(`Unexpected procedure ${op.path}`);
    };
    void result().then((data) => { observer.next({ result: { data } }); observer.complete(); }, (error) => observer.error(error));
  })] });
  let invalidated: Promise<void> | undefined;
  try {
    const view = render(
      <testApi.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}><HomePage /></QueryClientProvider>
      </testApi.Provider>,
    );
    const trigger = await view.findByRole("button", { name: "House shop" });
    fireEvent.click(trigger);
    const houseShop = within(view.getByRole("dialog"));
    expect(await houseShop.findByText("Furniture catalog")).toBeTruthy();
    expect(Shop.default).toHaveBeenLastCalledWith(expect.objectContaining({
      defaultType: "FURNITURE", restrictTypes: ["FURNITURE"], initialBreak: false, title: "Furniture",
    }), undefined);
    // Ordinary item purchases invalidate this query; a fresh draft must use the delivered rows and revision.
    home.furniture = [...furniture, rug];
    home.furnitureRevision++;
    act(() => {
      invalidated = queryClient.invalidateQueries({ queryKey: getQueryKey(testApi.home.getUserHome, undefined, "query") });
    });
    await waitFor(() => expect(homeQueries).toBe(2));
    fireEvent.click(houseShop.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    const decorate = view.getByRole("button", { name: "Decorate" }) as HTMLButtonElement;
    expect(decorate.disabled).toBe(true);
    fireEvent.click(decorate);
    expect(view.queryByRole("button", { name: "Move Bed" })).toBeNull();
    await act(async () => { finishRefresh(); await Promise.all([refreshed, invalidated]); });
    await waitFor(() => expect(decorate.disabled).toBe(false));
    fireEvent.click(decorate);
    expect(view.getByRole("button", { name: /Woven Rug.*In inventory/ })).toBeTruthy();
  } finally {
    finishRefresh();
    await invalidated;
    queryClient.clear();
  }
}, 20_000);
