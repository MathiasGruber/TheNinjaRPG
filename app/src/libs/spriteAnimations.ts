import type { SpriteAnimation } from "@/drizzle/schema";

export type CharacterAnimation = Pick<
  SpriteAnimation,
  "id" | "name" | "url" | "columns" | "rows" | "frameCount" | "fps" | "facing"
>;
export type CharacterAnimations = Record<string, CharacterAnimation>;
export type SpriteAnimationEvent = { id: string; actionKey: string };

/** Use catalogue IDs, so inventory instances and jutsu reskins keep the same assignment. */
export const spriteActionKey = (action: { type: string; id: string }) =>
  action.type === "basic" && action.id === "move"
    ? "move"
    : `${action.type}:${action.id}`;

export const resolveSpriteAnimation = (
  animations: CharacterAnimations | undefined,
  actionKey: string,
) => animations?.[actionKey] ?? animations?.idle;

/** Snapshot only rendering data, never editor or author fields, into the battle. */
export const snapshotSpriteAnimations = (
  bindings: { actionKey: string; animation: SpriteAnimation | null }[] = [],
): CharacterAnimations =>
  Object.fromEntries(
    bindings.flatMap(({ actionKey, animation }) => {
      if (!animation) return [];
      const { id, name, url, columns, rows, frameCount, fps, facing } = animation;
      return [[actionKey, { id, name, url, columns, rows, frameCount, fps, facing }]];
    }),
  );

export const spriteAnimationFrame = (
  animation: CharacterAnimation,
  elapsedMs: number,
  loop: boolean,
) => {
  const frame = Math.floor((Math.max(0, elapsedMs) * animation.fps) / 1000);
  return loop
    ? frame % animation.frameCount
    : Math.min(frame, animation.frameCount - 1);
};
