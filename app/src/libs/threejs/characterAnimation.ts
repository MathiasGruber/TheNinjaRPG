import { NearestFilter, type Sprite, SpriteMaterial, type Texture } from "three";
import type { AvatarFacing } from "@/drizzle/constants";
import type {
  CharacterAnimation,
  CharacterAnimations,
  SpriteAnimationEvent,
} from "@/libs/spriteAnimations";
import { resolveSpriteAnimation, spriteAnimationFrame } from "@/libs/spriteAnimations";
import { loadTexture } from "@/libs/threejs/util";

type AnimationRuntime = {
  material: SpriteMaterial;
  animationId?: string;
  stateKey?: string;
  startedAt: number;
  eventId?: string;
  events: SpriteAnimationEvent[];
  eventStartedAt?: number;
};

/**
 * Characters retain their existing Sprite while swapping sheets with different grids.
 * SpriteMixer's ActionSprite fixes its grid at construction; this adapter owns a private
 * map per actor so grid changes and cell mirroring never mutate a shared atlas.
 */
export const updateCharacterAnimation = (info: {
  sprite: Sprite;
  animations: CharacterAnimations | undefined;
  event: SpriteAnimationEvent | undefined;
  moving: boolean;
  facing: AvatarFacing;
  staticMap: Texture;
  now: number;
  textureForPath?: typeof loadTexture;
}) => {
  const { sprite, animations, event, moving, facing, staticMap, now } = info;
  const textureForPath = info.textureForPath ?? loadTexture;
  if (!animations || Object.keys(animations).length === 0) return;
  let runtime = sprite.userData.characterAnimation as AnimationRuntime | undefined;
  if (!runtime) {
    // A newly mounted scene starts idle instead of replaying an old persisted action.
    runtime = {
      material: new SpriteMaterial({
        transparent: true,
        alphaTest: 0.5,
        depthWrite: false,
      }),
      startedAt: now,
      eventId: event?.id,
      events: [],
    };
    sprite.userData.characterAnimation = runtime;
    const owned = runtime;
    sprite.userData.disposeCharacterAnimation = () => {
      owned.events.length = 0;
      if (owned.material.userData.ownsMap) owned.material.map?.dispose();
      owned.material.dispose();
    };
  }
  if (event && runtime.eventId !== event.id) {
    runtime.eventId = event.id;
    if (event.actionKey !== "move" && animations[event.actionKey])
      runtime.events.push(event);
  }
  let actionEvent = runtime.events[0];
  let action = actionEvent ? animations[actionEvent.actionKey] : undefined;
  if (
    !moving &&
    runtime.eventStartedAt !== undefined &&
    (!action || now - runtime.eventStartedAt >= (action.frameCount / action.fps) * 1000)
  ) {
    runtime.events.shift();
    runtime.eventStartedAt = undefined;
    actionEvent = runtime.events[0];
    action = actionEvent ? animations[actionEvent.actionKey] : undefined;
  }
  // Travel can outlast several delivered actions. Start each assigned one-shot
  // in order after travel, so a later action or wait cannot erase an unseen cast.
  if (!moving && actionEvent && runtime.eventStartedAt === undefined) {
    runtime.eventStartedAt = now;
  }
  const actionPlaying =
    action &&
    runtime.eventStartedAt !== undefined &&
    now - runtime.eventStartedAt < (action.frameCount / action.fps) * 1000;
  const key = moving
    ? "move"
    : actionPlaying
      ? (actionEvent?.actionKey ?? "idle")
      : "idle";
  let animation = resolveSpriteAnimation(animations, key);
  // Failed or still-loading action atlases also fall back through idle to the image.
  let source = animation ? textureForPath(animation.url, 0) : undefined;
  if (!source?.image) {
    animation = animations.idle;
    source = animation ? textureForPath(animation.url, 0) : undefined;
  }
  if (!animation || !source?.image) {
    if (runtime.material.userData.ownsMap) runtime.material.map?.dispose();
    runtime.material.userData.ownsMap = false;
    if (runtime.material.map !== staticMap) {
      runtime.material.map = staticMap;
      runtime.material.needsUpdate = true;
    }
    runtime.animationId = undefined;
    runtime.stateKey = undefined;
    sprite.material = runtime.material;
    return;
  }
  if (runtime.animationId !== animation.id) {
    if (runtime.material.userData.ownsMap) runtime.material.map?.dispose();
    const map = source.clone();
    map.generateMipmaps = false;
    map.minFilter = map.magFilter = NearestFilter;
    map.needsUpdate = true;
    runtime.material.map = map;
    runtime.material.userData.ownsMap = true;
    runtime.material.needsUpdate = true;
    runtime.animationId = animation.id;
  }
  const stateKey =
    !moving && actionPlaying && animation === action ? actionEvent?.id : key;
  if (runtime.stateKey !== stateKey) {
    runtime.stateKey = stateKey;
    runtime.startedAt =
      !moving && actionPlaying && animation === action
        ? (runtime.eventStartedAt ?? now)
        : now;
  }
  const frame = spriteAnimationFrame(
    animation,
    now - runtime.startedAt,
    !(!moving && actionPlaying && animation === action),
  );
  const map = runtime.material.map;
  if (!map) return;
  applySpriteAnimationFrame(map, animation, frame, animation.facing !== facing);
  sprite.material = runtime.material;
};

/** Mirror inside one cell, rather than flipping the entire atlas or its frame order. */
export const applySpriteAnimationFrame = (
  texture: Texture,
  animation: CharacterAnimation,
  frame: number,
  mirrored: boolean,
) => {
  const column = frame % animation.columns;
  const row = Math.floor(frame / animation.columns);
  texture.repeat.set((mirrored ? -1 : 1) / animation.columns, 1 / animation.rows);
  texture.offset.set(
    (column + (mirrored ? 1 : 0)) / animation.columns,
    1 - (row + 1) / animation.rows,
  );
};
