import type { UserTitle } from "@/drizzle/schema";
import type { TimedBuff } from "@/libs/timedBuffs";
import { IncreaseMasteryTag, IncreaseRegenerationTag } from "@/validators/combat";
import type { TitleEffect } from "@/validators/title";

/** Convert the restricted title payload to the existing passive combat tag contract. */
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

/** Retain acquisition boundaries when integrating offline recovery; titles add to timed bonuses. */
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

export const describeTitleEffect = (effect: TitleEffect) =>
  effect.type === "increasemastery"
    ? `+${effect.power} ${effect.masteryTypes.join(", ")} combat mastery`
    : `+${effect.power} regeneration`;
