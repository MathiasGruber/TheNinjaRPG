import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { GameLayoutPicker } from "@/layout/GameLayoutPicker";
import { GAME_LAYOUT_THEME_STORAGE_KEY } from "@/libs/layoutThemes";
import { ensureDom } from "../setup-dom.mjs";

ensureDom();
const browserGlobals = ["Event", "CustomEvent"] as const;
const browserDescriptors = browserGlobals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

beforeEach(() => {
  localStorage.removeItem(GAME_LAYOUT_THEME_STORAGE_KEY);
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
