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
import { HomeTypeDetails, IMG_HOME_KITCHEN } from "@/drizzle/constants";
import * as sleep from "@/hooks/sleep";
import * as ContentBox from "@/layout/ContentBox";
import * as Image from "@/layout/Image";
import * as Link from "@/layout/Link";
import * as Modal from "@/layout/Modal";
import { getDefaultHomeLayout, type HomeFurniture } from "@/libs/home";
import * as RamenShop from "@/layout/RamenShop";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../../setup-dom.mjs";
import { actualDialog, actualModal } from "../../setup/preload";

const furniture: HomeFurniture[] = [{
  id: "owned-bed", itemId: "home-bed", name: "Bed", description: "Rest", image: "/images/home/furniture/bed.webp", width: 34, groundAnchor: 91.1, action: "sleep", isFloor: false, quantity: 1, views: {},
}];
const rug: HomeFurniture = {
  id: "owned-rug", itemId: "custom-rug", name: "Woven Rug", description: "A floor decoration", image: "/custom-rug.webp", width: 25, groundAnchor: 88.5, action: null, isFloor: true, quantity: 1, views: {},
};

const testApi = createTRPCReact<AppRouter>();
let savedEvent: typeof Event;
let savedCustomEvent: typeof CustomEvent;
let savedAnimationFrame: PropertyDescriptor | undefined;
let savedCancelAnimationFrame: PropertyDescriptor | undefined;

beforeEach(() => {
  ensureDom();
  savedEvent = globalThis.Event;
  savedCustomEvent = globalThis.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  savedAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  savedCancelAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  Object.defineProperties(globalThis, {
    requestAnimationFrame: { configurable: true, value: (callback: FrameRequestCallback) => Number(setTimeout(() => callback(Date.now()), 0)) },
    cancelAnimationFrame: { configurable: true, value: (id: number) => clearTimeout(id) },
  });
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
  vi.spyOn(ContentBox, "default").mockImplementation(({ children, topRightContent }) => (
    <div><div data-testid="home-header-controls">{topRightContent}</div>{children}</div>
  ));
  vi.spyOn(Image, "default").mockImplementation(({ alt }) => <img alt={alt} />);
  vi.spyOn(Link, "default").mockImplementation(({ children, href }) => (
    <a href={String(href)}>{children}</a>
  ));
  vi.spyOn(RamenShop, "RamenMenu").mockImplementation(() => <p>Kitchen menu</p>);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
});
afterEach(async () => {
  cleanup();
  // Radix restores focus on a timer while unmounting its dialog.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  globalThis.Event = savedEvent;
  globalThis.CustomEvent = savedCustomEvent;
  for (const [key, descriptor] of [["requestAnimationFrame", savedAnimationFrame], ["cancelAnimationFrame", savedCancelAnimationFrame]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  vi.restoreAllMocks();
});

it("refreshes a selected furniture variant when returning from inventory", async () => {
  vi.spyOn(Image, "default").mockImplementation(({ alt, src }) => <img alt={alt} src={typeof src === "string" ? src : undefined} />);
  let homeQueries = 0;
  let selectedImage = "/base-chair.webp";
  const chair: HomeFurniture = {
    ...rug, id: "owned-chair", itemId: "chair", name: "Chair", isFloor: false,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
    if (op.path === "home.getUserHome") {
      homeQueries++;
      const home: NonNullable<RouterOutputs["home"]["getUserHome"]> = {
        homeType: "NONE", regen: HomeTypeDetails.NONE.regen, storage: HomeTypeDetails.NONE.storage,
        furniture: [{ ...chair, image: selectedImage }], furnitureRevision: 3,
        layout: [{ id: chair.id, x: 50, y: 50, rotation: 0 }],
      };
      observer.next({ result: { data: home } });
    } else if (op.path === "home.getAvailableUpgrades" || op.path === "item.getUserItems") {
      observer.next({ result: { data: [] } });
    } else {
      throw new Error(`Unexpected procedure ${op.path}`);
    }
    observer.complete();
  })] });
  const mount = () => render(
    <testApi.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}><HomePage /></QueryClientProvider>
    </testApi.Provider>,
  );
  try {
    const firstVisit = mount();
    await firstVisit.findByRole("button", { name: "Decorate" });
    expect(firstVisit.container.querySelector('img[src="/base-chair.webp"]')).not.toBeNull();
    firstVisit.unmount();
    selectedImage = "/red-chair.webp";
    // Variant selection refreshes inventory; the next home visit must fetch its selected appearance.
    await queryClient.invalidateQueries({ queryKey: getQueryKey(testApi.item.getUserItemsWithVariants, undefined, "query") });
    const secondVisit = mount();
    await waitFor(() => expect(secondVisit.container.querySelector('img[src="/red-chair.webp"]')).not.toBeNull());
    expect(homeQueries).toBe(2);
    expect(secondVisit.container.querySelector('img[src="/base-chair.webp"]')).toBeNull();
  } finally {
    queryClient.clear();
  }
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
    for (const name of ["Cancel", "Undo changes"]) {
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

// Real dialog focus and query refresh need an integration-test budget.
it("opens home management from the header and waits for refreshed inventory before decorating", async () => {
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
    const trigger = await view.findByRole("button", { name: "Manage home" });
    await view.findByRole("button", { name: "Decorate" });
    const header = within(view.getByTestId("home-header-controls"));
    expect(header.getByRole("button", { name: "Manage home" })).toBe(trigger);
    expect(header.getByRole("button", { name: "Decorate" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "House shop" })).toBeNull();
    fireEvent.click(trigger);
    const management = within(view.getByRole("dialog"));
    expect(management.getByText("Home Management")).toBeTruthy();
    // Ordinary item purchases invalidate this query; a fresh draft must use the delivered rows and revision.
    home.furniture = [...furniture, rug];
    home.furnitureRevision++;
    act(() => {
      invalidated = queryClient.invalidateQueries({ queryKey: getQueryKey(testApi.home.getUserHome, undefined, "query") });
    });
    await waitFor(() => expect(homeQueries).toBe(2));
    fireEvent.click(management.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    const decorate = view.getByRole("button", { name: "Decorate" }) as HTMLButtonElement;
    expect(decorate.disabled).toBe(true);
    fireEvent.click(decorate);
    expect(view.queryByRole("button", { name: "Move Bed" })).toBeNull();
    await act(async () => { finishRefresh(); await Promise.all([refreshed, invalidated]); });
    await waitFor(() => expect(decorate.disabled).toBe(false));
    fireEvent.click(decorate);
    expect(view.getByRole("button", { name: /Woven Rug.*Place$/ })).toBeTruthy();
  } finally {
    finishRefresh();
    await invalidated;
    queryClient.clear();
  }
}, 20_000);

it("opens the kitchen with owned artwork or its fallback and returns focus to its action", async () => {
  for (const hasKitchen of [true, false]) {
    const kitchen: HomeFurniture = {
      ...rug, id: "owned-kitchen", itemId: "home-kitchen", name: "Kitchen",
      image: "/kitchen.webp", isFloor: false, action: "kitchen",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
      if (op.path === "home.getUserHome") {
        observer.next({ result: { data: {
          homeType: "NONE", regen: HomeTypeDetails.NONE.regen, storage: HomeTypeDetails.NONE.storage,
          furniture: hasKitchen ? [kitchen] : [], furnitureRevision: 3, layout: hasKitchen ? getDefaultHomeLayout([kitchen]) : [],
        } } });
      } else if (op.path === "home.getAvailableUpgrades" || op.path === "item.getUserItems") {
        observer.next({ result: { data: [] } });
      } else {
        throw new Error(`Unexpected procedure ${op.path}`);
      }
      observer.complete();
    })] });
    try {
      const view = render(
        <testApi.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}><HomePage /></QueryClientProvider>
        </testApi.Provider>,
      );
      const trigger = await view.findByRole("button", { name: "Kitchen" });
      expect(view.queryByRole("link", { name: /ramen shop/i })).toBeNull();
      fireEvent.click(trigger);
      const kitchenDialog = within(view.getByRole("dialog"));
      expect(await kitchenDialog.findByText("Kitchen menu")).toBeTruthy();
      expect(RamenShop.RamenMenu).toHaveBeenLastCalledWith({
        image: hasKitchen ? "/kitchen.webp" : IMG_HOME_KITCHEN,
        imageClassName: "mx-auto h-40 w-auto max-w-full object-contain",
      }, undefined);
      fireEvent.click(kitchenDialog.getAllByRole("button", { name: "Close" })[0]!);
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    } finally {
      queryClient.clear();
      cleanup();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}, 20_000);
