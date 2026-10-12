import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/api/root";
import * as client from "@/app/_trpc/client";
import type { RouterInputs, RouterOutputs } from "@/app/_trpc/client";
import HomePage from "@/app/[shell]/home/page";
import { HomeTypeDetails } from "@/drizzle/constants";
import * as sleep from "@/hooks/sleep";
import * as ContentBox from "@/layout/ContentBox";
import * as Image from "@/layout/Image";
import * as Link from "@/layout/Link";
import { getDefaultHomeLayout } from "@/libs/home";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../../setup-dom.mjs";

const testApi = createTRPCReact<AppRouter>();

beforeEach(() => {
  ensureDom();
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
afterEach(() => {
  cleanup();
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
