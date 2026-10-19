import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { useState } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useSelectGameLayout } from "@/hooks/useGameLayout";
import { GameLayoutPicker } from "@/layout/GameLayoutPicker";
import { LAYOUT_PREFERENCE_COOKIE } from "@/libs/layoutPreference";
import { GAME_LAYOUTS, type GameLayoutId } from "@/libs/gameLayouts";
import { LayoutContextProvider, useActiveLayout } from "@/utils/LayoutContext";
import { ensureDom } from "../setup-dom.mjs";

ensureDom();
const browserGlobals = ["Event", "CustomEvent"] as const;
const browserDescriptors = browserGlobals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

beforeEach(() => {
  localStorage.removeItem(LAYOUT_PREFERENCE_COOKIE);
  document.cookie = `${LAYOUT_PREFERENCE_COOKIE}=; path=/; max-age=0`;
  for (const key of browserGlobals) Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} });
});

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  browserGlobals.forEach((key, index) => {
    const descriptor = browserDescriptors[index];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

const openPicker = async (layout: GameLayoutId = "default") => {
  const onLayoutChange = vi.fn();
  const view = render(<GameLayoutPicker layout={layout} onLayoutChange={onLayoutChange} />);
  expect(view.getAllByRole("combobox")).toHaveLength(1);
  fireEvent.keyDown(view.getByRole("combobox", { name: "Game layout" }), { key: "ArrowDown" });
  await view.findByRole("option", { name: "Classic" });
  return { ...view, onLayoutChange };
};

describe("game layout picker", () => {
  it("changes layouts in place without refreshing or navigating the authentication shell", async () => {
    const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
    function ConnectedPicker() {
      const selectLayout = useSelectGameLayout();
      const layout = useActiveLayout();
      return <GameLayoutPicker layout={layout} onLayoutChange={selectLayout} />;
    }
    function LayoutFrame() {
      const [layout, setLayout] = useState<GameLayoutId>("default");
      return (
        <AppRouterContext.Provider value={router as never}>
          <LayoutContextProvider value={layout} onLayoutChange={setLayout} isPixelLanding={false}>
            <ConnectedPicker />
          </LayoutContextProvider>
        </AppRouterContext.Provider>
      );
    }
    const view = render(<LayoutFrame />);
    fireEvent.keyDown(view.getByRole("combobox", { name: "Game layout" }), { key: "ArrowDown" });
    await act(async () => fireEvent.keyDown(await view.findByRole("option", { name: "Eclipse Observatory" }), { key: "Enter" }));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(view.getByRole("combobox", { name: "Game layout" }).textContent).toContain("Eclipse Observatory");
    expect(document.cookie).toContain(`${LAYOUT_PREFERENCE_COOKIE}=20-eclipse-observatory`);
    expect(localStorage.getItem(LAYOUT_PREFERENCE_COOKIE)).toBe('"20-eclipse-observatory"');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.keyDown(view.getByRole("combobox", { name: "Game layout" }), { key: "ArrowDown" });
    await act(async () => fireEvent.keyDown(await view.findByRole("option", { name: "Sakura Courtyard" }), { key: "Enter" }));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAYOUT_PREFERENCE_COOKIE)).toBe('"3-sakura-courtyard"');
  });

  it("offers all five layouts as peers in one selector", async () => {
    const view = await openPicker();
    expect(view.getAllByRole("listbox")).toHaveLength(1);
    expect(view.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Classic", "Pixel", "Eclipse Observatory", "Obsidian Council", "Sakura Courtyard",
    ]);
  });

  it.each([...GAME_LAYOUTS])("selects $name using its own layout ID", async ({ name, id }) => {
    const view = await openPicker(id === "default" ? "pixel" : "default");
    await act(async () => fireEvent.keyDown(view.getByRole("option", { name }), { key: "Enter" }));
    await waitFor(() => expect(view.onLayoutChange).toHaveBeenCalledWith(id));
  });

  it.each([...GAME_LAYOUTS])("restores $name directly as the current option", async ({ name, id }) => {
    const view = await openPicker(id);
    expect(view.getByRole("option", { name }).getAttribute("aria-selected")).toBe("true");
  });
});
