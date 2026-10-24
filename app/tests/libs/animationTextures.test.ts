import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { Texture, TextureLoader } from "three";
import type { CharacterAnimation } from "@/libs/spriteAnimations";
import { acquireAnimationTexture, animationTextureUrl } from "@/libs/threejs/animationTextures";

const leases: Array<{ release: () => void }> = [];
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
beforeEach(() => {
  vi.spyOn(TextureLoader.prototype, "load").mockImplementation(() => new Texture());
});
afterEach(() => {
  for (const lease of leases.splice(0)) lease.release();
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
  it("does not download legacy oversized loops", () => {
    expect(acquire(sheet({ frameCount: 160, rows: 27, columns: 6 }))).toBeUndefined();
    expect(TextureLoader.prototype.load).not.toHaveBeenCalled();
  });
});
