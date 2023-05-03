import type { GroundEffect, UserEffect } from "./types";
import type { ReturnedUserState } from "./types";
/**
 * Based on a tag, calculate the power
 * @param tag - the tag
 * @param user - the user who is using the tag
 */
export const formulaPower = (
  tag: GroundEffect | UserEffect,
  user: ReturnedUserState
) => {
  if ("calculation" in tag && tag.calculation === "formula") {
    let power = tag.power;
    tag.statTypes?.forEach((statType) => {
      if (statType === "Taijutsu" && user.taijutsu_offence) {
        power += user.taijutsu_offence;
      } else if (statType === "Bukijutsu" && user.bukijutsu_offence) {
        power += user.bukijutsu_offence;
      } else if (statType === "Ninjutsu" && user.ninjutsu_offence) {
        power += user.ninjutsu_offence;
      } else if (statType === "Genjutsu" && user.genjutsu_offence) {
        power += user.genjutsu_offence;
      }
    });
    tag.generalTypes?.forEach((generalType) => {
      if (generalType === "Strength" && user.strength) {
        power += user.strength;
      } else if (generalType === "Speed" && user.speed) {
        power += user.speed;
      } else if (generalType === "Willpower" && user.willpower) {
        power += user.willpower;
      } else if (generalType === "Intelligence" && user.intelligence) {
        power += user.intelligence;
      }
    });
    return power;
  } else if ("power" in tag) {
    return tag.power;
  }
  return undefined;
};
