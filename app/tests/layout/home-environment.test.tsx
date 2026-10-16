import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ImageProps } from "next/image";
import { type CombatBiome, HomeTypes, IMG_BG_DESSERT, IMG_BG_SNOW } from "@/drizzle/constants";
import { HomeEnvironment } from "@/layout/HomeEnvironment";
import { HomeScene } from "@/layout/HomeScene";
import * as Image from "@/layout/Image";
import { getHomeOverviewCamera, getHomeRooms } from "@/libs/homeProperty";
import { DECORATION_ASSETS_BY_KEY } from "@/libs/sector-map/decorations";
import { bunnyImageUrl } from "@/utils/image";
import { ensureDom } from "../setup-dom.mjs";

beforeEach(() => {
  ensureDom();
  vi.spyOn(Image, "default").mockImplementation(({ src, onError }: ImageProps) => (
    // biome-ignore lint/performance/noImgElement: expose optional sprite failures without network loading
    <img src={String(src)} alt="" onError={onError} />
  ));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ["ground", "ground", "/images/home/ground.webp", "tree.green"],
  ["default", "ground", "/images/home/ground.webp", "tree.green"],
  ["arena", "ground", "/images/home/ground.webp", "tree.green"],
  ["dessert", "dessert", bunnyImageUrl(IMG_BG_DESSERT, 768), "cactus."],
  ["ocean", "dessert", bunnyImageUrl(IMG_BG_DESSERT, 768), "cactus."],
  ["ice", "snow", bunnyImageUrl(IMG_BG_SNOW, 768), "tree.snow"],
  ["snow", "snow", bunnyImageUrl(IMG_BG_SNOW, 768), "tree.snow"],
] as const)("blends %s homes with the map's structure terrain", (biome, terrain, texture, tree) => {
  const view = render(<HomeEnvironment homeType="TOWN_HOUSE" biome={biome} />);
  const ground = view.container.querySelector<HTMLElement>("[data-home-grounds]")!;
  expect(ground.dataset.homeGrounds).toBe(terrain);
  expect(ground.style.backgroundImage).toContain(texture);
  expect(ground.style.backgroundColor).not.toBe("");
  expect(ground.style.backgroundBlendMode).toBe(terrain === "dessert" ? "multiply" : "");
  expect(view.container.querySelector(`[data-home-scenery^="${tree}"]`)).not.toBeNull();
  for (const sprite of view.container.querySelectorAll<HTMLElement>("[data-home-scenery]")) {
    const key = sprite.dataset.homeScenery!;
    expect(sprite.querySelector("img")?.getAttribute("src")).toBe(DECORATION_ASSETS_BY_KEY.get(key)?.filepath);
    expect(sprite.getAttribute("aria-hidden")).toBe("true");
    expect(sprite.classList.contains("pointer-events-none")).toBe(true);
  }
});

it.each(HomeTypes.filter((tier) => tier !== "NONE"))("keeps %s scenery clear of walls, usable rooms, yard and farm", (homeType) => {
  for (const biome of ["ground", "dessert", "ice"] as CombatBiome[]) {
    const view = render(<HomeEnvironment homeType={homeType} biome={biome} />);
    const sprites = [...view.container.querySelectorAll<HTMLElement>("[data-home-scenery]")];
    const camera = getHomeOverviewCamera(homeType);
    expect(sprites.length).toBeGreaterThan(0);
    expect(sprites.length).toBeLessThan(35);
    for (const sprite of sprites) {
      const left = Number.parseFloat(sprite.style.left);
      const top = Number.parseFloat(sprite.style.top);
      const right = left + Number.parseFloat(sprite.style.width);
      const bottom = top + Number.parseFloat(sprite.style.height);
      expect(Number(sprite.style.zIndex)).toBe(Math.round(bottom * 10));
      expect(camera.x + left * camera.scale).toBeGreaterThanOrEqual(0);
      expect(camera.x + right * camera.scale).toBeLessThanOrEqual(100);
      expect(camera.y + top * camera.scale).toBeGreaterThanOrEqual(0);
      expect(camera.y + bottom * camera.scale).toBeLessThanOrEqual(100);
      for (const room of getHomeRooms(homeType)) {
        const area = room.isYard
          ? { left: room.x, right: room.x + room.width, top: room.y, bottom: room.y + 100 }
          : { left: room.x + 7.5, right: room.x + 94.5, top: room.y + 3, bottom: room.y + 87 };
        expect(left < area.right && right > area.left && top < area.bottom && bottom > area.top).toBe(false);
      }
    }
    const before = view.container.innerHTML;
    view.rerender(<HomeEnvironment homeType={homeType} biome={biome} />);
    expect(view.container.innerHTML).toBe(before);
    const ground = view.container.querySelector<HTMLElement>("[data-home-grounds]")!;
    const margin = 100 / Math.min(0.3, getHomeOverviewCamera(homeType).scale);
    expect(Number.parseFloat(ground.style.left)).toBe(-margin);
    expect(Number.parseFloat(ground.style.width)).toBeGreaterThan(2 * margin);
    view.unmount();
  }
});

it("hides only failed optional scenery and retains its terrain and neighboring sprites", () => {
  const view = render(<HomeEnvironment homeType="STUDIO_APARTMENT" biome="ice" />);
  const images = view.container.querySelectorAll<HTMLImageElement>("img");
  expect(images.length).toBeGreaterThan(1);
  fireEvent.error(images[0]!);
  expect(images[0]!.style.visibility).toBe("hidden");
  expect(images[1]!.style.visibility).toBe("");
  expect(view.container.querySelector("[data-home-grounds]")).not.toBeNull();
});

it("gives tents village terrain without adding scenery over their authored exterior", () => {
  const view = render(<HomeEnvironment homeType="NONE" biome="ice" />);
  expect(view.container.querySelector("[data-home-grounds]")?.getAttribute("data-home-grounds")).toBe("snow");
  expect(view.container.querySelector("[data-home-scenery]")).toBeNull();
});

it("keeps the complete home and furniture actions available after a scenery failure", () => {
  const onSleep = vi.fn();
  const view = render(<HomeScene
    homeType="STUDIO_APARTMENT"
    biome="ice"
    isGuest={false}
    isAsleep={false}
    isTogglingSleep={false}
    isDecorating={false}
    onDecoratingChange={() => {}}
    onSleep={onSleep}
    onStorage={() => {}}
    onKitchen={() => {}}
    onFarm={() => {}}
    furniture={[{ id: "bed", itemId: "bed", name: "Bed", image: "/bed.webp", width: 6, groundAnchor: 92, action: "sleep", isFloor: false, quantity: 1, views: {} }]}
    layout={[{ id: "bed", x: 22, y: 15.15, rotation: 0 }]}
  />);
  const ground = view.container.querySelector("[data-home-grounds]");
  const walls = view.container.querySelectorAll("[data-home-wall]").length;
  expect(walls).toBeGreaterThan(0);
  const scenery = view.container.querySelector<HTMLImageElement>("[data-home-scenery] img")!;
  fireEvent.error(scenery);
  expect(scenery.style.visibility).toBe("hidden");
  expect(view.queryByText(/Home artwork is unavailable/)).toBeNull();
  expect(view.container.querySelector("[data-home-grounds]")).toBe(ground);
  expect(view.container.querySelectorAll("[data-home-wall]").length).toBe(walls);
  fireEvent.click(view.getByRole("button", { name: "Bed: Go to sleep" }));
  expect(onSleep).toHaveBeenCalledTimes(1);
});
