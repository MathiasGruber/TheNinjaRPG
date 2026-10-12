import { ensureDom } from "../setup-dom.mjs";
const { cleanup, fireEvent, render, within } = await import("@testing-library/react");
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { existsSync } from "node:fs";
import type { ImgHTMLAttributes, AnchorHTMLAttributes } from "react";
import { HomeTypes } from "@/drizzle/constants";
import { HomeScene, HOME_SCENE_IMAGES } from "@/layout/HomeScene";

// Wrapper stubs isolate the scene's routing destinations and image-failure handling.
vi.mock("@/layout/Image", () => ({
  default: ({ src, alt, onError }: ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: isolated image-failure test stub
    <img src={src} alt={alt} onError={onError} />
  ),
}));
vi.mock("@/layout/Link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const props = {
  homeType: "NONE" as const,
  isGuest: false,
  isAsleep: false,
  isTogglingSleep: false,
  onSleep: vi.fn(),
  onStorage: vi.fn(),
  onManage: vi.fn(),
};

/** Regression coverage for residence navigation, owner access, and artwork recovery. */
describe("Home scene", () => {
  beforeEach(() => {
    ensureDom();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("ships distinct artwork for every existing home tier", () => {
    expect(new Set(Object.values(HOME_SCENE_IMAGES)).size).toBe(HomeTypes.length);
    for (const tier of HomeTypes) {
      expect(existsSync(`public${HOME_SCENE_IMAGES[tier]}`)).toBe(true);
    }
  });

  it("opens home actions and links to the existing kitchen and farm destinations", () => {
    const view = render(<HomeScene {...props} />);
    const scene = within(view.getByRole("group", { name: "Home scene" }));
    fireEvent.click(scene.getByRole("button", { name: "Bed: Go to sleep" }));
    fireEvent.click(scene.getByRole("button", { name: "Armory: Open home storage" }));
    fireEvent.click(view.getByRole("button", { name: "Manage home" }));
    expect(props.onSleep).toHaveBeenCalledTimes(1);
    expect(props.onStorage).toHaveBeenCalledTimes(1);
    expect(props.onManage).toHaveBeenCalledTimes(1);
    expect(scene.getByRole("link", { name: "Kitchen: Visit ramen shop" }).getAttribute("href")).toBe("/ramenshop");
    expect(scene.getByRole("link", { name: "Garden: Visit farm" }).getAttribute("href")).toBe("/farm");
  });

  it("preserves awake/asleep feedback and prevents duplicate pending sleep actions", () => {
    const view = render(<HomeScene {...props} isAsleep />);
    expect(view.getByRole("button", { name: "Wake up" })).toBeTruthy();
    expect(view.getByRole("status").textContent).toContain("You are asleep");
    view.rerender(<HomeScene {...props} isTogglingSleep />);
    fireEvent.click(view.getByRole("button", { name: "Bed: Please wait…" }));
    fireEvent.click(view.getByRole("button", { name: "Please wait…" }));
    expect(props.onSleep).not.toHaveBeenCalled();
    expect(view.getByRole("status").textContent).toContain("Changing sleep status");
  });

  it("keeps storage and management unavailable in a guest residence", () => {
    const view = render(<HomeScene {...props} isGuest />);
    fireEvent.click(view.getByRole("button", { name: "Armory: Home storage is in your own village" }));
    fireEvent.click(view.getByRole("button", { name: "Home storage" }));
    expect(props.onStorage).not.toHaveBeenCalled();
    expect(view.queryByRole("button", { name: "Manage home" })).toBeNull();
    expect(view.getByRole("button", { name: "Go to sleep" })).toBeTruthy();
  });

  it("keeps textual navigation working when the artwork fails", () => {
    const view = render(<HomeScene {...props} />);
    fireEvent.error(view.getByRole("img"));
    const actions = within(view.getByRole("group", { name: "Home actions" }));
    fireEvent.click(actions.getByRole("button", { name: "Home storage" }));
    expect(props.onStorage).toHaveBeenCalledTimes(1);
    expect(actions.getByRole("link", { name: "Farm" }).getAttribute("href")).toBe("/farm");
    expect(view.getByText(/Home artwork is unavailable/)).toBeTruthy();
  });

  it("loads a new tier after artwork failure while keeping dialog triggers mounted", () => {
    const view = render(<HomeScene {...props} />);
    const trigger = view.getByRole("button", { name: "Manage home" });
    fireEvent.error(view.getByRole("img"));
    view.rerender(<HomeScene {...props} homeType="PALACE" />);
    expect(view.getByRole("img").getAttribute("src")).toBe(HOME_SCENE_IMAGES.PALACE);
    expect(view.queryByText(/Home artwork is unavailable/)).toBeNull();
    expect(view.getByRole("button", { name: "Manage home" })).toBe(trigger);
  });
});
