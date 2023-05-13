import type { UserEffect } from "./types";
import type { ReturnedUserState } from "./types";

export const damangeCalc = (tag: UserEffect, target: ReturnedUserState) => {
  // Get ratios between all stats & generals
  let ratio = 1;
  if ("calculation" in tag && tag.calculation === "formula") {
    if (tag.direction === "offensive") {
      tag.statTypes?.forEach((statType) => {
        if (
          statType === "Taijutsu" &&
          tag.taijutsu_offence &&
          target.taijutsu_defence
        ) {
          ratio *= tag.taijutsu_offence / target.taijutsu_defence;
        } else if (
          statType === "Bukijutsu" &&
          tag.bukijutsu_offence &&
          target.bukijutsu_defence
        ) {
          ratio *= tag.bukijutsu_offence / target.bukijutsu_defence;
        } else if (
          statType === "Ninjutsu" &&
          tag.ninjutsu_offence &&
          target.ninjutsu_defence
        ) {
          ratio *= tag.ninjutsu_offence / target.ninjutsu_defence;
        } else if (
          statType === "Genjutsu" &&
          tag.genjutsu_offence &&
          target.genjutsu_defence
        ) {
          ratio *= tag.genjutsu_offence / target.genjutsu_defence;
        } else if (
          statType === "Highest" &&
          tag.highest_offence &&
          target.highest_defence
        ) {
          ratio *= tag.highest_offence / target.highest_defence;
        }
      });
    } else {
      tag.statTypes?.forEach((statType) => {
        if (
          statType === "Taijutsu" &&
          tag.taijutsu_defence &&
          target.taijutsu_offence
        ) {
          ratio *= tag.taijutsu_defence / target.taijutsu_offence;
        } else if (
          statType === "Bukijutsu" &&
          tag.bukijutsu_defence &&
          target.bukijutsu_offence
        ) {
          ratio *= tag.bukijutsu_defence / target.bukijutsu_offence;
        } else if (
          statType === "Ninjutsu" &&
          tag.ninjutsu_defence &&
          target.ninjutsu_offence
        ) {
          ratio *= tag.ninjutsu_defence / target.ninjutsu_offence;
        } else if (
          statType === "Genjutsu" &&
          tag.genjutsu_defence &&
          target.genjutsu_offence
        ) {
          ratio *= tag.genjutsu_defence / target.genjutsu_offence;
        } else if (
          statType === "Highest" &&
          tag.highest_defence &&
          target.highest_offence
        ) {
          ratio *= tag.highest_defence / target.highest_offence;
        }
      });
    }
  }
  const damage = Math.floor(20 * ratio);
  return damage;
};
