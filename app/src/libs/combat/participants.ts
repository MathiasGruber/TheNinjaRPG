import type { BattleType } from "@/drizzle/constants";
import {
  COMBAT_BORDER_BOTTOM,
  COMBAT_BORDER_LEFT,
  COMBAT_BORDER_RIGHT,
  COMBAT_BORDER_TOP,
} from "@/libs/combat/constants";

/**
 * Whether quest content may add NPC templates to the initiating player's team.
 * QUEST objectives and quest-bound OVERWORLD fights carry these authored allies;
 * their `direction` defines teams regardless of village or template identity.
 * Other modes retain their own team, reward and objective rules. This is narrower
 * than QuestBattleTypes, which also includes raids and random encounters.
 */
export const supportsNpcAllies = (battleType: BattleType): boolean =>
  battleType === "QUEST" || battleType === "OVERWORLD";

/**
 * Enumerate distinct spawn cells within one team's combat borders.
 * Capacity validation and placement share this finite list so an overcrowded
 * team is rejected instead of retrying occupied cells indefinitely. Small fields
 * retain the columns allowed by the combat border bounds, including inverted bounds.
 */
export const getBattleSpawnLocations = (
  width: number,
  height: number,
  direction: "left" | "right",
) => {
  const halfWidth = Math.floor(width / 2);
  const min = direction === "left" ? 1 : halfWidth + 1;
  const max = direction === "left" ? halfWidth : width - 3;
  const firstX = min + COMBAT_BORDER_LEFT;
  const lastX = max - COMBAT_BORDER_RIGHT;
  // Preserve the small-field columns produced by the existing random bounds.
  const minX = Math.min(firstX, lastX + 1);
  const maxX = Math.max(firstX, lastX);
  const locations: { x: number; y: number }[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = 1 + COMBAT_BORDER_BOTTOM; y <= height - COMBAT_BORDER_TOP - 1; y++) {
      locations.push({ x, y });
    }
  }
  return locations;
};
