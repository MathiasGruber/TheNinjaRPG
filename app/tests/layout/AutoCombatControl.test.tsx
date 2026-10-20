import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { AutoCombatControl } from "@/layout/AutoCombatControl";
import { ensureDom } from "../setup-dom.mjs";

const browserGlobals = ["Event", "CustomEvent", "ResizeObserver"] as const;
const browserDescriptors = browserGlobals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
beforeEach(() => {
  ensureDom();
  Object.defineProperties(globalThis, {
    Event: { configurable: true, value: window.Event },
    CustomEvent: { configurable: true, value: window.CustomEvent },
    ResizeObserver: { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } },
  });
});
afterEach(async () => {
  cleanup();
  // Radix restores focus on the next task, while it still needs DOM Event globals.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  browserGlobals.forEach((key, index) => {
    const descriptor = browserDescriptors[index];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
});

const mount = (overrides: Partial<Parameters<typeof AutoCombatControl>[0]> = {}) => {
  ensureDom();
  const onChange = vi.fn();
  const props = { isActive: false, isPending: false, requiresConfirmation: true, onChange, ...overrides };
  return { ...render(<AutoCombatControl {...props} />), onChange, props };
};

it("requires confirmation to enable PvP AI and leaves cancellation manual", () => {
  const view = mount();
  const toggle = view.getByRole("switch", { name: "AI control" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  expect(view.getByRole("dialog")).toBeDefined();
  expect(view.onChange).not.toHaveBeenCalled();
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(view.getAllByRole("button", { name: "Close" }).at(-1)!);
  expect(view.onChange).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  fireEvent.click(view.getByRole("button", { name: "Enable AI control" }));
  expect(view.onChange).toHaveBeenCalledTimes(1);
  expect(view.onChange).toHaveBeenCalledWith(true);
});

it("shows restored AI state and returns to manual without confirmation", () => {
  const view = mount({ isActive: true });
  expect(view.getByText("AI control: On")).toBeDefined();
  fireEvent.click(view.getByRole("switch", { name: "AI control" }));
  expect(view.onChange).toHaveBeenCalledTimes(1);
  expect(view.onChange).toHaveBeenCalledWith(false);
  expect(view.queryByRole("dialog")).toBeNull();
});

it("preserves the direct PvE toggle and explains its saved preference", () => {
  const view = mount({ requiresConfirmation: false });
  fireEvent.click(view.getByRole("switch", { name: "AI control" }));
  expect(view.onChange).toHaveBeenCalledTimes(1);
  expect(view.onChange).toHaveBeenCalledWith(true);
  expect(view.queryByRole("dialog")).toBeNull();
  expect(view.getByText(/future non-PvP battles/)).toBeDefined();
});

it("disables the control while saving and shows failed changes beside it", () => {
  const view = mount({ isPending: true, error: "You are no longer fighting in this battle" });
  fireEvent.click(view.getByRole("switch", { name: "AI control" }));
  expect(view.onChange).not.toHaveBeenCalled();
  expect(view.queryByRole("dialog")).toBeNull();
  expect(view.getByRole("alert").textContent).toContain("no longer fighting");
});

it("discards an unconfirmed handover when a different battle mounts", () => {
  const view = mount();
  fireEvent.click(view.getByRole("switch", { name: "AI control" }));
  view.rerender(<AutoCombatControl key="next-battle" {...view.props} />);
  expect(view.queryByRole("dialog")).toBeNull();
  expect(view.onChange).not.toHaveBeenCalled();
});
