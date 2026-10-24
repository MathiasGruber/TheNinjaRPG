import { NearestFilter, SRGBColorSpace, type Texture } from "three";
import { SPRITE_ANIMATION_LIMITS } from "@/drizzle/constants";
import type { CharacterAnimation } from "@/libs/spriteAnimations";
import { getTextureLoader } from "@/libs/threejs/util";
import { isBunnyCdnUrl, textureImageUrl } from "@/utils/image";

// Include pinned atlases in the budget; crowded battles fall back to static art.
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_SHEETS = 16;
const atlases = new Map<string, { texture: Texture; bytes: number; users: number }>();

/** Static-only mode releases decoded sheets while preserving the HTTP disk cache. */
export const clearUnusedAnimationTextures = () => {
  for (const [key, atlas] of atlases) {
    if (atlas.users) continue;
    atlas.texture.dispose();
    atlases.delete(key);
  }
};

/** Request an exact cell width, rather than the CDN's default whole-image width. */
export const animationTextureUrl = (
  animation: CharacterAnimation,
  cellSize: number,
) => {
  const path = textureImageUrl(animation.url, animation.columns * cellSize);
  if (!isBunnyCdnUrl(path)) return path;
  const url = new URL(path);
  url.searchParams.set("height", String(animation.rows * cellSize));
  url.searchParams.set("format", "webp");
  url.searchParams.set("quality", "90");
  return url.toString();
};

/**
 * Share a pending/decoded atlas across actors. Idle and the current action stay
 * pinned; unused sheets are evicted oldest-first before admitting another load.
 * Stable URLs leave compressed files in the browser's HTTP cache after eviction.
 */
export const acquireAnimationTexture = (
  animation: CharacterAnimation,
  cellSize: number,
) => {
  // Old battle snapshots may predate the editor's short-loop limits.
  if (
    animation.frameCount > SPRITE_ANIMATION_LIMITS.frames ||
    animation.columns * animation.rows > SPRITE_ANIMATION_LIMITS.cells ||
    animation.frameCount / animation.fps > SPRITE_ANIMATION_LIMITS.seconds
  )
    return undefined;
  const url = animationTextureUrl(animation, cellSize);
  let entry = atlases.get(url);
  if (!entry) {
    const bytes = animation.columns * animation.rows * cellSize ** 2 * 4;
    if (bytes > MAX_BYTES) return undefined;
    let used = [...atlases.values()].reduce((total, atlas) => total + atlas.bytes, 0);
    for (const [key, atlas] of atlases) {
      if (used + bytes <= MAX_BYTES && atlases.size < MAX_SHEETS) break;
      if (atlas.users) continue;
      atlas.texture.dispose();
      atlases.delete(key);
      used -= atlas.bytes;
    }
    if (used + bytes > MAX_BYTES || atlases.size >= MAX_SHEETS) return undefined;
    const texture = getTextureLoader().load(
      url,
      (loaded) => {
        // External URLs may ignore resizing. Never upload an oversized atlas to WebGL.
        const { width, height } = loaded.image;
        if (
          width * height * 4 > bytes ||
          width % animation.columns !== 0 ||
          height % animation.rows !== 0 ||
          width / animation.columns !== height / animation.rows
        ) {
          loaded.userData.failed = true;
          loaded.image = document.createElement("img");
          loaded.dispose();
        }
      },
      undefined,
      () => {
        texture.userData.failed = true;
      },
    );
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = NearestFilter;
    entry = { texture, bytes, users: 0 };
    atlases.set(url, entry);
  }
  entry.users++;
  const owned = entry;
  return {
    texture: owned.texture,
    release: () => {
      owned.users--;
      // Map insertion order is the eviction order, refreshed when a sheet becomes unused.
      atlases.delete(url);
      atlases.set(url, owned);
    },
  };
};
