import type { UserTitle } from "@/drizzle/schema";
import type { TimedBuff } from "@/libs/timedBuffs";
import { IncreaseMasteryTag, IncreaseRegenerationTag } from "@/validators/combat";
import type { TitleEffect } from "@/validators/title";

/** Map a flat title bonus to the combat engine's existing self-targeted tag schema. */
export const titleCombatTag = (effect: TitleEffect) =>
  effect.type === "increasemastery"
    ? IncreaseMasteryTag.parse({
        ...effect,
        calculation: "static",
        powerPerLevel: 0,
        target: "SELF",
      })
    : IncreaseRegenerationTag.parse({
        ...effect,
        calculation: "static",
        powerPerLevel: 0,
        target: "SELF",
      });

/**
 * Combine timed buffs with every owned title's immutable regeneration snapshot.
 * Acquisition timestamps bound offline recovery; a finite far-future expiry represents permanence.
 */
export const regenerationBuffs = (user: {
  raidBuffs?: readonly TimedBuff[];
  titles?: readonly Pick<UserTitle, "effects" | "createdAt">[];
}): TimedBuff[] => [
  ...(user.raidBuffs ?? []),
  ...(user.titles ?? []).map((owned) => ({
    createdAt: owned.createdAt,
    expiresAt: new Date("9999-12-31T23:59:59.000Z"),
    effects: owned.effects
      .filter((effect) => effect.type === "increaseregeneration")
      .map(titleCombatTag),
    stacking: true,
  })),
];

/** Format flat bonuses consistently in catalog previews and player collections. */
export const describeTitleEffect = (effect: TitleEffect) =>
  effect.type === "increasemastery"
    ? `+${effect.power} ${effect.masteryTypes.join(", ")} combat mastery`
    : `+${effect.power} regeneration`;
