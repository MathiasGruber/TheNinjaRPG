import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import * as navigation from "next/navigation";
import * as client from "@/app/_trpc/client";
import { EventGainMultiplierPanel } from "@/app/[shell]/event/page";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../../setup-dom.mjs";

const save = vi.fn();

beforeEach(() => {
  ensureDom();
  save.mockClear();
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({}),
    misc: {
      getSetting: { useQuery: () => ({ data: undefined }) },
      setEventGameSetting: { useMutation: () => ({ mutate: save, isPending: false }) },
    },
  });
  vi.spyOn(UserContext, "useRequiredUserData").mockReturnValue({
    data: { role: "EVENT-ADMIN" },
    timeDiff: 0,
  } as ReturnType<typeof UserContext.useRequiredUserData>);
  vi.spyOn(navigation, "useRouter").mockReturnValue({
    bfcacheId: "event-slider-test",
    back: vi.fn(),
    forward: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("submits the displayed event duration when a multiplier is clicked immediately", () => {
  const view = render(
    <EventGainMultiplierPanel
      setting="regenGainMultiplier"
      title="Regen"
      subtitle="Modify gains"
    />,
  );
  const slider = view.getByRole("slider") as HTMLInputElement;
  fireEvent.input(slider, { target: { value: "20" } });
  fireEvent.click(view.getByRole("button", { name: "2X" }));
  expect(slider.value).toBe("20");
  expect(save).toHaveBeenCalledWith({
    setting: "regenGainMultiplier",
    multiplier: "2",
    days: 20,
  });
});
