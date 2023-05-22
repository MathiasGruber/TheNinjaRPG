import type { UserEffect } from "./types";
import type { BattleUserState } from "./types";

export const damangeCalc = (
  tag: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState
) => {
  let ratio = 1;
  if ("calculation" in tag && tag.calculation === "formula") {
    const dir = tag.direction === "offensive";
    tag.statTypes?.forEach((statType) => {
      const lower = statType.toLowerCase();
      const a = `${lower}_${dir ? "offence" : "defence"}`;
      const b = `${lower}_${dir ? "defence" : "offence"}`;
      if (tag.fromGround && a in tag && b in target) {
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
        console.log(`Damage [${statType}] from ground`);
        const left = tag[a as keyof typeof tag] as number;
        const right = target[b as keyof typeof target] as number;
        ratio *= left / right;
        console.log(ratio);
      } else if (origin && a in origin && b in target) {
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
        console.log(`Damage [${statType}] from user`);
        const left = origin[a as keyof typeof origin] as number;
        const right = target[b as keyof typeof target] as number;
        ratio *= left / right;
        console.log(ratio);
      }
    });
    tag.generalTypes?.forEach((generalType) => {
      const lower = generalType.toLowerCase();
      if (tag.fromGround && lower in tag && lower in target) {
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
        console.log(`Damage [${generalType}] from ground`);
        const left = tag[lower as keyof typeof tag] as number;
        const right = target[lower as keyof typeof target] as number;
        ratio *= left / right;
        console.log(ratio);
      } else if (origin && lower in origin && lower in target) {
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
        console.log(`Damage [${generalType}] from user`);
        const left = origin[lower as keyof typeof origin] as number;
        const right = target[lower as keyof typeof target] as number;
        ratio *= left / right;
        console.log(ratio);
      }
    });
  }
  const damage = Math.floor(20 * ratio);
  return damage;
};
