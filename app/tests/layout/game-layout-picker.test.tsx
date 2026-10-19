import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { useState } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useSelectGameLayout } from "@/hooks/useGameLayoutTheme";
import { GameLayoutPicker } from "@/layout/GameLayoutPicker";
import { LAYOUT_PREFERENCE_COOKIE } from "@/libs/layoutPreference";
import { GAME_LAYOUT_THEME_STORAGE_KEY } from "@/libs/layoutThemes";
import { LayoutContextProvider, useActiveLayout } from "@/utils/LayoutContext";
import { ensureDom } from "../setup-dom.mjs";

ensureDom();
const browserGlobals = ["Event", "CustomEvent"] as const;
const browserDescriptors = browserGlobals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

beforeEach(() => {
  localStorage.removeItem(GAME_LAYOUT_THEME_STORAGE_KEY);
  localStorage.removeItem(LAYOUT_PREFERENCE_COOKIE);
  document.cookie = `${LAYOUT_PREFERENCE_COOKIE}=; path=/; max-age=0`;
  for (const key of browserGlobals) Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} });
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(GAME_LAYOUT_THEME_STORAGE_KEY);
  browserGlobals.forEach((key, index) => {
    const descriptor = browserDescriptors[index];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

const openPicker = async (layout: "default" | "pixel" | "themed" = "default") => {
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
      const [layout, setLayout] = useState<"default" | "pixel" | "themed">("default");
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
    expect(document.cookie).toContain(`${LAYOUT_PREFERENCE_COOKIE}=themed`);
    expect(localStorage.getItem(LAYOUT_PREFERENCE_COOKIE)).toBe('"themed"');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.keyDown(view.getByRole("combobox", { name: "Game layout" }), { key: "ArrowDown" });
    await act(async () => fireEvent.keyDown(await view.findByRole("option", { name: "Sakura Courtyard" }), { key: "Enter" }));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(GAME_LAYOUT_THEME_STORAGE_KEY)).toBe('"3-sakura-courtyard"');
  });

  it("offers all five layouts as peers in one selector", async () => {
    const view = await openPicker();
    expect(view.getAllByRole("listbox")).toHaveLength(1);
    expect(view.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Classic", "Pixel", "Eclipse Observatory", "Obsidian Council", "Sakura Courtyard",
    ]);
  });

  it.each([
    ["Eclipse Observatory", "20-eclipse-observatory"],
    ["Obsidian Council", "17-obsidian-council"],
    ["Sakura Courtyard", "3-sakura-courtyard"],
  ])("selects %s directly from Classic and remembers its identity", async (name, id) => {
    const view = await openPicker();
    await act(async () => fireEvent.keyDown(view.getByRole("option", { name }), { key: "Enter" }));
    await waitFor(() => expect(view.onLayoutChange).toHaveBeenCalledWith("themed"));
    expect(localStorage.getItem(GAME_LAYOUT_THEME_STORAGE_KEY)).toBe(JSON.stringify(id));
  });

  it.each([["Classic", "default"], ["Pixel", "pixel"]])("returns to %s while preserving the last themed choice", async (name, family) => {
    localStorage.setItem(GAME_LAYOUT_THEME_STORAGE_KEY, '"3-sakura-courtyard"');
    const view = await openPicker("themed");
    await act(async () => fireEvent.keyDown(view.getByRole("option", { name }), { key: "Enter" }));
    expect(view.onLayoutChange).toHaveBeenCalledWith(family);
    expect(localStorage.getItem(GAME_LAYOUT_THEME_STORAGE_KEY)).toBe('"3-sakura-courtyard"');
  });

  it("updates the selected design within the current game shell", async () => {
    localStorage.setItem(GAME_LAYOUT_THEME_STORAGE_KEY, '"3-sakura-courtyard"');
    const view = await openPicker("themed");
    expect(view.getByRole("option", { name: "Sakura Courtyard" }).getAttribute("aria-selected")).toBe("true");
    await act(async () => fireEvent.keyDown(view.getByRole("option", { name: "Eclipse Observatory" }), { key: "Enter" }));
    expect(view.onLayoutChange).toHaveBeenCalledWith("themed");
    expect(view.getByRole("combobox", { name: "Game layout" }).textContent).toContain("Eclipse Observatory");
  });
});
