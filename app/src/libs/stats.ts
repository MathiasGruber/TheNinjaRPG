import type { StatType, UserStatName } from "@/drizzle/constants";

// Get the offense variant of a combat stat (e.g. "Ninjutsu" -> "ninjutsuOffence")
export function toOffenceStat(
  stat: StatType,
): Extract<UserStatName, `${string}Offence`> {
  return `${stat.toLowerCase()}Offence` as Extract<UserStatName, `${string}Offence`>;
}

// Get the defense variant of a combat stat (e.g. "Ninjutsu" -> "ninjutsuDefence")
export function toDefenceStat(
  stat: StatType,
): Extract<UserStatName, `${string}Defence`> {
  return `${stat.toLowerCase()}Defence` as Extract<UserStatName, `${string}Defence`>;
}
