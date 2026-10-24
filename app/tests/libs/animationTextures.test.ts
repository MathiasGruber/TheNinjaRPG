import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { Group, Sprite, Texture, TextureLoader } from "three";
import type { CharacterAnimation } from "@/libs/spriteAnimations";
import { acquireAnimationTexture, animationTextureUrl, clearUnusedAnimationTextures } from "@/libs/threejs/animationTextures";
import { updateCharacterAnimation } from "@/libs/threejs/characterAnimation";

const leases: Array<{ release: () => void }> = [];
const sprites: Sprite[] = [];
let sequence = 0;
const sheet = (patch: Partial<CharacterAnimation> = {}): CharacterAnimation => ({
  id: "atlas", name: "Atlas", url: `https://uploadthing.b-cdn.net/f/test-${sequence++}.png`,
  columns: 8, rows: 8, frameCount: 64, fps: 12.5, facing: "left", ...patch,
});
const acquire = (animation: CharacterAnimation, cellSize = 256) => {
  const lease = acquireAnimationTexture(animation, cellSize);
  if (lease) leases.push(lease);
  return lease;
};
const pendingLargeSheets = () => {
  const loads: Array<{ texture: Texture<HTMLImageElement>; finish: () => void; fail: () => void }> = [];
  vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad, _progress, onError) => {
    const texture = new Texture<HTMLImageElement>();
    loads.push({ texture, finish: () => {
      texture.image = document.createElement("img");
      texture.image.width = 8 * 256;
      texture.image.height = 9 * 256;
      onLoad?.(texture);
    }, fail: () => onError?.(new Error("Unavailable atlas")) });
    return texture;
  });
  return loads;
};
beforeEach(() => {
  vi.spyOn(TextureLoader.prototype, "load").mockImplementation(() => new Texture());
});
afterEach(() => {
  for (const sprite of sprites.splice(0)) sprite.userData.disposeCharacterAnimation?.();
  for (const lease of leases.splice(0)) lease.release();
  clearUnusedAnimationTextures();
  vi.restoreAllMocks();
});

describe("character atlas cache", () => {
  it("uses stable exact-cell CDN renditions without cache-busting", () => {
    const animation = sheet();
    const url = new URL(animationTextureUrl(animation, 128));
    expect(url.searchParams.get("width")).toBe("1024");
    expect(url.searchParams.get("height")).toBe("1024");
    expect(url.searchParams.get("format")).toBe("webp");
    expect(animationTextureUrl(animation, 128)).toBe(url.toString());
  });
  it("shares pending loads, reuses released sheets and evicts only unused atlases", () => {
    const a = sheet(); const b = sheet(); const c = sheet();
    const first = acquire(a)!;
    const secondActor = acquire(a)!;
    expect(secondActor.texture).toBe(first.texture);
    const second = acquire(b)!;
    expect(acquire(c)).toBeUndefined(); // Two pinned 16 MiB atlases fill the budget.
    first.release(); leases.splice(leases.indexOf(first), 1);
    expect(acquire(c)).toBeUndefined(); // The second actor still uses A.
    secondActor.release(); leases.splice(leases.indexOf(secondActor), 1);
    const disposed = vi.spyOn(first.texture, "dispose");
    expect(acquire(c)).toBeDefined();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(acquire(b)!.texture).toBe(second.texture);
  });
  it("reuses decoded images across repeated battles without loading again", () => {
    const animation = sheet({ columns: 6, rows: 4, frameCount: 24 });
    const first = acquire(animation, 128)!;
    first.release(); leases.splice(leases.indexOf(first), 1);
    const second = acquire(animation, 128)!;
    expect(second.texture).toBe(first.texture);
    expect(TextureLoader.prototype.load).toHaveBeenCalledTimes(1);
  });
  it("swaps individually admissible atlases through static art and starts a lazy action at its first frame", () => {
    const loads = pendingLargeSheets();
    const idle = sheet({ id: "idle", rows: 9 });
    const attack = sheet({ id: "attack", rows: 9 });
    const sprite = new Sprite();
    sprites.push(sprite);
    const staticMap = new Texture();
    const info = { sprite, animations: { idle, "jutsu:fire": attack }, event: undefined,
      moving: false, facing: "left" as const, staticMap, now: 0, cellSize: 256 };
    updateCharacterAnimation(info);
    loads[0]!.finish();
    updateCharacterAnimation({ ...info, now: 100 });
    const idleMap = sprite.material.map!;
    const cloneDisposed = vi.spyOn(idleMap, "dispose");
    const idleDisposed = vi.spyOn(loads[0]!.texture, "dispose").mockImplementation(() => {
      // A released source must not survive eviction through this actor's cloned map.
      expect(sprite.material.map?.image).not.toBe(loads[0]!.texture.image);
    });
    const event = { id: "cast", actionKey: "jutsu:fire" };
    updateCharacterAnimation({ ...info, event, now: 200 });
    expect(loads).toHaveLength(2); // Each atlas is 18 MiB; together they exceed 32 MiB.
    expect(sprite.material.map).toBe(staticMap);
    expect(cloneDisposed).toHaveBeenCalledTimes(1);
    expect(idleDisposed).toHaveBeenCalledTimes(1);
    expect(sprite.userData.characterAnimation.events).toEqual([event]);
    expect(sprite.userData.characterAnimation.eventStartedAt).toBeUndefined();
    updateCharacterAnimation({ ...info, event, now: 9000 });
    expect(loads).toHaveLength(2);
    expect(sprite.userData.characterAnimation.eventStartedAt).toBeUndefined();
    loads[1]!.finish();
    updateCharacterAnimation({ ...info, event, now: 10000 });
    expect(sprite.material.map?.image).toBe(loads[1]!.texture.image);
    expect(sprite.material.map?.offset.x).toBe(0);
    expect(sprite.userData.characterAnimation.eventStartedAt).toBe(10000);
    updateCharacterAnimation({ ...info, event, now: 15120 });
    expect(loads).toHaveLength(3);
    expect(sprite.material.map).toBe(staticMap);
    expect(sprite.userData.characterAnimation.events).toEqual([]);
    loads[2]!.finish();
    updateCharacterAnimation({ ...info, event, now: 15200 });
    expect(sprite.userData.characterAnimation.animationId).toBe("idle");
    expect(sprite.material.map?.image).toBe(loads[2]!.texture.image);
    expect(sprite.userData.characterAnimation.sources.size).toBe(1);
  });
  it("keeps another actor's shared idle pinned when a large action cannot fit", () => {
    const loads = pendingLargeSheets();
    const idle = sheet({ id: "idle", rows: 9 });
    const attack = sheet({ id: "attack", rows: 9 });
    const first = new Sprite(); const second = new Sprite();
    sprites.push(first, second);
    const info = { animations: { idle, "jutsu:fire": attack }, event: undefined,
      moving: false, facing: "left" as const, staticMap: new Texture(), now: 0, cellSize: 256 };
    updateCharacterAnimation({ ...info, sprite: first });
    updateCharacterAnimation({ ...info, sprite: second });
    loads[0]!.finish();
    updateCharacterAnimation({ ...info, sprite: first, now: 100 });
    updateCharacterAnimation({ ...info, sprite: second, now: 100 });
    const secondMap = second.material.map;
    const disposed = vi.spyOn(loads[0]!.texture, "dispose");
    updateCharacterAnimation({ ...info, sprite: first, event: { id: "cast", actionKey: "jutsu:fire" }, now: 200 });
    expect(loads).toHaveLength(1);
    expect(disposed).not.toHaveBeenCalled();
    expect(first.material.map?.image).toBe(loads[0]!.texture.image);
    expect(second.material.map).toBe(secondMap);
    expect(first.userData.characterAnimation.events).toEqual([]);
    first.userData.disposeCharacterAnimation();
    clearUnusedAnimationTextures();
    expect(disposed).not.toHaveBeenCalled();
    expect(second.material.map).toBe(secondMap);
  });
  it("advances past a failed large sheet to another action without retaining its lease", () => {
    const loads = pendingLargeSheets();
    const idle = sheet({ id: "idle", rows: 9 });
    const bad = sheet({ id: "bad", rows: 9 });
    const good = sheet({ id: "good", rows: 9 });
    const sprite = new Sprite();
    sprites.push(sprite);
    const info = { sprite, animations: { idle, "jutsu:bad": bad, "jutsu:good": good },
      moving: false, facing: "left" as const, staticMap: new Texture(), cellSize: 256 };
    updateCharacterAnimation({ ...info, event: undefined, now: 0 });
    loads[0]!.finish();
    updateCharacterAnimation({ ...info, event: undefined, now: 100 });
    updateCharacterAnimation({ ...info, event: { id: "bad", actionKey: "jutsu:bad" }, now: 200 });
    expect(loads).toHaveLength(2);
    loads[1]!.fail();
    updateCharacterAnimation({ ...info, event: { id: "good", actionKey: "jutsu:good" }, now: 300 });
    expect(sprite.userData.characterAnimation.events).toEqual([{ id: "good", actionKey: "jutsu:good" }]);
    const failedDisposed = vi.spyOn(loads[1]!.texture, "dispose");
    updateCharacterAnimation({ ...info, event: undefined, now: 400 });
    expect(loads).toHaveLength(3);
    expect(failedDisposed).toHaveBeenCalledTimes(1);
    clearUnusedAnimationTextures();
    expect(failedDisposed).toHaveBeenCalledTimes(1);
    loads[2]!.finish();
    updateCharacterAnimation({ ...info, event: undefined, now: 9000 });
    expect(sprite.userData.characterAnimation.animationId).toBe("good");
    expect(sprite.userData.characterAnimation.eventStartedAt).toBe(9000);
    expect(sprite.userData.characterAnimation.sources.size).toBe(1);
  });
  it("detaches decoded atlases from hidden actors after cache eviction and clearing", () => {
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
      const texture = new Texture<HTMLImageElement>();
      texture.image = document.createElement("img");
      texture.image.width = texture.image.height = 8 * 256;
      onLoad?.(texture);
      return texture;
    });
    const group = new Group();
    for (let index = 0; index < 5; index++) {
      const sprite = new Sprite();
      sprites.push(sprite);
      group.add(sprite);
      updateCharacterAnimation({ sprite, animations: { idle: sheet() }, event: undefined,
        moving: false, facing: "left", staticMap: new Texture(), now: 0, cellSize: 256 });
      expect(sprite.material.map?.image).toHaveProperty("width", 2048);
      sprite.visible = false;
      group.traverse((child) => child.userData.disposeCharacterAnimation?.());
    }
    clearUnusedAnimationTextures();
    expect(TextureLoader.prototype.load).toHaveBeenCalledTimes(5);
    expect(group.children).toHaveLength(5);
    let retainedBytes = 0;
    group.traverse((child) => {
      if (!(child instanceof Sprite)) return;
      const image = (child.material.map as Texture<HTMLImageElement> | null)?.image;
      if (image) retainedBytes += image.width * image.height * 4;
    });
    expect(retainedBytes).toBe(0);
  });
  it("does not download legacy oversized loops", () => {
    expect(acquire(sheet({ frameCount: 160, rows: 27, columns: 6 }))).toBeUndefined();
    expect(TextureLoader.prototype.load).not.toHaveBeenCalled();
  });
  it("validates external sheets separately when their grids differ", () => {
    const animation = sheet({ url: "https://example.com/shared-grid.png" });
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
      const texture = new Texture<HTMLImageElement>();
      texture.image = document.createElement("img");
      texture.image.width = texture.image.height = 1024;
      onLoad?.(texture);
      return texture;
    });
    const rejected = acquire({ ...animation, columns: 4, rows: 4, frameCount: 16 }, 128)!;
    expect(rejected.texture.userData.failed).toBe(true);
    const accepted = acquire(animation, 128)!;
    expect(accepted.texture).not.toBe(rejected.texture);
    expect(accepted.texture.userData.failed).not.toBe(true);
    expect(accepted.texture.image).toHaveProperty("width", 1024);
    expect(TextureLoader.prototype.load).toHaveBeenCalledTimes(2);
  });
  it("can render an external desktop sheet after the mobile budget rejects it", () => {
    const animation = sheet({ url: "https://example.com/desktop.png", columns: 6, rows: 4, frameCount: 24 });
    const load = vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
      const texture = new Texture<HTMLImageElement>();
      texture.image = document.createElement("img");
      texture.image.width = 6 * 256;
      texture.image.height = 4 * 256;
      onLoad?.(texture);
      return texture;
    });
    const sprite = new Sprite();
    sprites.push(sprite);
    const staticMap = new Texture();
    const info = { sprite, animations: { idle: animation }, event: undefined,
      moving: false, facing: "left" as const, staticMap, now: 0 };
    updateCharacterAnimation({ ...info, cellSize: 128 });
    expect(sprite.material.map).toBe(staticMap);
    updateCharacterAnimation({ ...info, cellSize: 256, now: 100 });
    expect(sprite.material.map).not.toBe(staticMap);
    expect(sprite.material.map?.image).toHaveProperty("width", 6 * 256);
    expect(sprite.material.map?.userData.failed).not.toBe(true);
    expect(load.mock.calls.map(([url]) => url))
      .toEqual([animation.url, animation.url]);
  });
  it("replaces an actor's external source when its requested cell size changes", () => {
    const animation = sheet({ url: "https://example.com/mobile.png", columns: 6, rows: 4, frameCount: 24 });
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
      const texture = new Texture<HTMLImageElement>();
      texture.image = document.createElement("img");
      texture.image.width = 6 * 128;
      texture.image.height = 4 * 128;
      onLoad?.(texture);
      return texture;
    });
    const sprite = new Sprite();
    sprites.push(sprite);
    const info = { sprite, animations: { idle: animation }, event: undefined,
      moving: false, facing: "left" as const, staticMap: new Texture(), now: 0 };
    updateCharacterAnimation({ ...info, cellSize: 128 });
    const first = sprite.material.map;
    const disposed = vi.spyOn(first!, "dispose");
    updateCharacterAnimation({ ...info, cellSize: 256, now: 100 });
    expect(sprite.material.map).not.toBe(first);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(sprite.userData.characterAnimation.sources.size).toBe(1);
    expect(TextureLoader.prototype.load).toHaveBeenCalledTimes(2);
  });
});
