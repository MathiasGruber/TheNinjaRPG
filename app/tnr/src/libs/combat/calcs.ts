import type { GroundEffect, UserEffect } from "./types";
import type { ReturnedUserState } from "./types";
/**
 * Based on a tag, calculate the offensive power
 */
export const formulaPower = (
  tag: GroundEffect | UserEffect,
  user: ReturnedUserState,
  type: "offence" | "defence" = "offence"
) => {
  if ("calculation" in tag && tag.calculation === "formula") {
    let power = tag.power;
    if (type === "offence") {
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
    } else {
      tag.statTypes?.forEach((statType) => {
        if (statType === "Taijutsu" && user.taijutsu_defence) {
          power += user.taijutsu_defence;
        } else if (statType === "Bukijutsu" && user.bukijutsu_defence) {
          power += user.bukijutsu_defence;
        } else if (statType === "Ninjutsu" && user.ninjutsu_defence) {
          power += user.ninjutsu_defence;
        } else if (statType === "Genjutsu" && user.genjutsu_defence) {
          power += user.genjutsu_defence;
        }
      });
    }
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
  return 0;
};

export const damangeCalc = (offencePower: number, defencePower: number) => {
  const ratio = offencePower / defencePower;
  const damage = Math.floor(20 * ratio);
  return damage;
};
