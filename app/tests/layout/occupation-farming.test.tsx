import { ensureDom } from "../setup-dom.mjs";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import OccupationFarming from "@/layout/OccupationFarming";

const refetch = vi.fn(async () => undefined);
const query = {
  data: undefined as { success: false; message: string } | undefined,
  isLoading: false,
  isFetching: false,
  refetch,
};

// The controller's transport is isolated so failed initial loads can be exercised directly.
vi.mock("@/hooks/farm-controller", () => ({
  useFarmController: () => ({
    farmState: null,
    selectedSlotIndex: null,
    selectedPlot: null,
    setSelectedSlotIndex: vi.fn(),
    query,
  }),
}));

const router = {
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  bfcacheId: "farm-test",
};

/** Initial farm failures must leave loading and remain recoverable inside a residence. */
describe("OccupationFarming load recovery", () => {
  beforeEach(() => {
    ensureDom();
    vi.clearAllMocks();
    query.data = undefined;
    query.isFetching = false;
  });
  afterEach(cleanup);

  it("offers retry when the initial request fails without farm data", () => {
    const view = render(
      <AppRouterContext.Provider value={router}>
        <OccupationFarming embedded />
      </AppRouterContext.Provider>,
    );
    expect(view.getByRole("alert").textContent).toContain("Could not load the farm.");
    expect(view.queryByText("Loading farm...")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows prerequisite rejection feedback and blocks duplicate retries", () => {
    query.data = { success: false, message: "You must be awake to use your farm." };
    query.isFetching = true;
    const view = render(
      <AppRouterContext.Provider value={router}>
        <OccupationFarming embedded />
      </AppRouterContext.Provider>,
    );
    expect(view.getByRole("alert").textContent).toContain(query.data.message);
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    expect(refetch).not.toHaveBeenCalled();
  });
});
