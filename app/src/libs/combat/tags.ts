import { scaleUserStats } from "@/libs/profile";
import { nanoid } from "nanoid";
import { isPositiveUserEffect, isNegativeUserEffect } from "./types";
import { HealTag } from "@/libs/combat/types";
import type { BattleUserState, Consequence } from "./types";
import type { GroundEffect, UserEffect, ActionEffect } from "./types";
import type { StatNames, GenNames, DmgConfig } from "./constants";
import type { GeneralType } from "@/drizzle/constants";
import type { BattleType } from "@/drizzle/constants";
import { capitalizeFirstLetter } from "@/utils/sanitize";

/** Absorb damage & convert it to healing */
export const absorb = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  // Prevent?
  const { pass } = preventCheck(usersEffects, "healprevent", target);
  if (!pass) return preventResponse(effect, target, "cannot absorb health");
  // Calculate absorption
  const { power, qualifier } = getPower(effect);
  // Pools that are going to be restored
  const pools =
    "poolsAffected" in effect && effect.poolsAffected
      ? effect.poolsAffected
      : ["Health" as const];
  const nPools = pools.length;
  // Apply the absorb effect the round after the effect is applied
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (
        consequence.targetId === effect.targetId &&
        consequence.damage &&
        consequence.damage > 0
      ) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const convert =
            Math.ceil(
              effect.calculation === "percentage"
                ? consequence.damage * (power / 100)
                : power > consequence.damage
                  ? consequence.damage
                  : power,
            ) * ratio;
          // consequence.damage -= convert;
          pools.map((pool) => {
            switch (pool) {
              case "Health":
                consequence.absorb_hp = convert / nPools;
                break;
              case "Stamina":
                consequence.absorb_sp = convert / nPools;
                break;
              case "Chakra":
                consequence.absorb_cp = convert / nPools;
                break;
            }
          });
        }
      }
    });
  }
  // Return info
  return getInfo(
    target,
    effect,
    `will absorb up to ${qualifier} damage and convert it to ${pools.join(", ")}`,
  );
};

/** Prevent buffing */
export const buffPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    const info = getInfo(target, effect, "cannot be buffed");
    effect.power = 100;
    return info;
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Prevent debuffing */
export const debuffPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    const info = getInfo(target, effect, "cannot be debuffed");
    effect.power = 100;
    return info;
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

export const getAffected = (effect: UserEffect, type?: "offence" | "defence") => {
  const stats: string[] = [];
  if ("statTypes" in effect && effect.statTypes) {
    effect.statTypes.forEach((stat) => {
      if (stat === "Highest") {
        const highestOffence = effect.highestOffence;
        if (highestOffence && (!type || type === "offence")) {
          stats.push(getStatTypeFromStat(highestOffence));
        }
        const highestDefence = effect.highestDefence;
        if (highestDefence && (!type || type === "defence")) {
          stats.push(getStatTypeFromStat(highestDefence));
        }
      } else {
        stats.push(stat);
      }
    });
  }
  if ("generalTypes" in effect && effect.generalTypes) {
    effect.generalTypes.forEach((general) => {
      if (general === "Highest") {
        const highestGenerals = effect.highestGenerals;
        highestGenerals?.forEach((gen) => {
          stats.push(capitalizeFirstLetter(gen));
        });
      } else {
        stats.push(general);
      }
    });
  }
  const uniqueStats = [...new Set(stats)];
  let result = `${uniqueStats.join(", ")}`;
  if ("elements" in effect && effect.elements && effect.elements.length > 0) {
    result += ` and elements ${effect.elements.join(", ")}`;
  }
  return result;
};

/** Adjust stats of target based on effect */
export const adjustStats = (effect: UserEffect, target: BattleUserState) => {
  const { power, adverb, qualifier } = getPower(effect);
  const affected = getAffected(effect);
  if ("statTypes" in effect || "generalTypes" in effect) {
    if (!effect.isNew && !effect.castThisRound) {
      effect.statTypes?.forEach((stat) => {
        if (stat === "Highest") {
          if (effect.calculation === "static") {
            switch (target.highestOffence) {
              case "ninjutsuOffence":
                target.ninjutsuOffence += power;
                break;
              case "genjutsuOffence":
                target.genjutsuOffence += power;
                break;
              case "taijutsuOffence":
                target.taijutsuOffence += power;
                break;
              case "bukijutsuOffence":
                target.bukijutsuOffence += power;
                break;
            }
            switch (target.highestDefence) {
              case "ninjutsuDefence":
                target.ninjutsuDefence += power;
                break;
              case "genjutsuDefence":
                target.genjutsuDefence += power;
                break;
              case "taijutsuDefence":
                target.taijutsuDefence += power;
                break;
              case "bukijutsuDefence":
                target.bukijutsuDefence += power;
                break;
            }
          } else if (effect.calculation === "percentage") {
            switch (target.highestOffence) {
              case "ninjutsuOffence":
                target.ninjutsuOffence *= (100 + power) / 100;
                break;
              case "genjutsuOffence":
                target.genjutsuOffence *= (100 + power) / 100;
                break;
              case "taijutsuOffence":
                target.taijutsuOffence *= (100 + power) / 100;
                break;
              case "bukijutsuOffence":
                target.bukijutsuOffence *= (100 + power) / 100;
                break;
            }
            switch (target.highestDefence) {
              case "ninjutsuDefence":
                target.ninjutsuDefence *= (100 + power) / 100;
                break;
              case "genjutsuDefence":
                target.genjutsuDefence *= (100 + power) / 100;
                break;
              case "taijutsuDefence":
                target.taijutsuDefence *= (100 + power) / 100;
                break;
              case "bukijutsuDefence":
                target.bukijutsuDefence *= (100 + power) / 100;
                break;
            }
          }
        } else if (stat === "Ninjutsu") {
          if (effect.calculation === "static") {
            target.ninjutsuOffence += power;
            target.ninjutsuDefence += power;
          } else if (effect.calculation === "percentage") {
            target.ninjutsuOffence *= (100 + power) / 100;
            target.ninjutsuDefence *= (100 + power) / 100;
          }
        } else if (stat === "Genjutsu") {
          if (effect.calculation === "static") {
            target.genjutsuOffence += power;
            target.genjutsuDefence += power;
          } else if (effect.calculation === "percentage") {
            target.genjutsuOffence *= (100 + power) / 100;
            target.genjutsuDefence *= (100 + power) / 100;
          }
        } else if (stat === "Taijutsu") {
          if (effect.calculation === "static") {
            target.taijutsuOffence += power;
            target.taijutsuDefence += power;
          } else if (effect.calculation === "percentage") {
            target.taijutsuOffence *= (100 + power) / 100;
            target.taijutsuDefence *= (100 + power) / 100;
          }
        } else if (stat === "Bukijutsu") {
          if (effect.calculation === "static") {
            target.bukijutsuOffence += power;
            target.bukijutsuDefence += power;
          } else if (effect.calculation === "percentage") {
            target.bukijutsuOffence *= (100 + power) / 100;
            target.bukijutsuDefence *= (100 + power) / 100;
          }
        }
      });
      effect.generalTypes?.forEach((general) => {
        if (general === "Highest") {
          if (effect.calculation === "static") {
            target.highestGenerals.forEach((gen) => {
              target[gen] += power;
            });
          } else if (effect.calculation === "percentage") {
            target.highestGenerals.forEach((gen) => {
              target[gen] *= (100 + power) / 100;
            });
          }
        } else if (general === "Strength") {
          if (effect.calculation === "static") {
            target.strength += power;
          } else if (effect.calculation === "percentage") {
            target.strength *= (100 + power) / 100;
          }
        } else if (general === "Intelligence") {
          if (effect.calculation === "static") {
            target.intelligence += power;
          } else if (effect.calculation === "percentage") {
            target.intelligence *= (100 + power) / 100;
          }
        } else if (general === "Willpower") {
          if (effect.calculation === "static") {
            target.willpower += power;
          } else if (effect.calculation === "percentage") {
            target.willpower *= (100 + power) / 100;
          }
        } else if (general === "Speed") {
          if (effect.calculation === "static") {
            target.speed += power;
          } else if (effect.calculation === "percentage") {
            target.speed *= (100 + power) / 100;
          }
        }
      });
    }
  }
  return getInfo(target, effect, `${affected} is ${adverb} by ${qualifier}`);
};

export const increaseStats = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  const { pass, preventTag } = preventCheck(usersEffects, "buffprevent", target);
  if (preventTag && preventTag.createdRound < effect.createdRound) {
    if (!pass) return preventResponse(effect, target, "cannot be buffed");
  }
  return adjustStats(effect, target);
};

export const decreaseStats = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  const { pass, preventTag } = preventCheck(usersEffects, "debuffprevent", target);
  if (preventTag && preventTag.createdRound < effect.createdRound) {
    if (!pass) return preventResponse(effect, target, "cannot be debuffed");
  }
  effect.power = -Math.abs(effect.power);
  effect.powerPerLevel = -Math.abs(effect.powerPerLevel);
  return adjustStats(effect, target);
};

/** Adjust damage given by target */
export const adjustDamageGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { power, adverb, qualifier } = getPower(effect);
  const affected = getAffected(effect, "offence");
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (consequence.userId === effect.targetId && consequence.damage) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const change =
            effect.calculation === "percentage"
              ? (power / 100) * consequence.damage
              : power;
          consequence.damage = consequence.damage + change * ratio;
        }
      }
    });
  }
  return getInfo(
    target,
    effect,
    `damage given [${affected}] is ${adverb} by up to ${qualifier}`,
  );
};

export const increaseDamageGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { pass, preventTag } = preventCheck(usersEffects, "buffprevent", target);
  if (preventTag && preventTag.createdRound < effect.createdRound) {
    if (!pass) return preventResponse(effect, target, "cannot be buffed");
  }
  return adjustDamageGiven(effect, usersEffects, consequences, target);
};

export const decreaseDamageGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { pass, preventTag } = preventCheck(usersEffects, "debuffprevent", target);
  if (preventTag && preventTag.createdRound < effect.createdRound) {
    if (!pass) return preventResponse(effect, target, "cannot be debuffed");
  }
  effect.power = -Math.abs(effect.power);
  effect.powerPerLevel = -Math.abs(effect.powerPerLevel);
  return adjustDamageGiven(effect, usersEffects, consequences, target);
};

/** Adjust damage taken by user */
export const adjustDamageTaken = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { power, adverb, qualifier } = getPower(effect);
  const affected = getAffected(effect, "offence");
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (consequence.targetId === effect.targetId && consequence.damage) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const change =
            effect.calculation === "percentage"
              ? (power / 100) * consequence.damage
              : power;
          consequence.damage = consequence.damage + change * ratio;
        }
      }
    });
  }
  return getInfo(
    target,
    effect,
    `damage taken [${affected}] is ${adverb} by up to ${qualifier}`,
  );
};

export const increaseDamageTaken = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { pass, preventTag } = preventCheck(usersEffects, "debuffprevent", target);
  if (preventTag && preventTag.createdRound < effect.createdRound) {
    if (!pass) return preventResponse(effect, target, "cannot be debuffed");
  }
  return adjustDamageTaken(effect, usersEffects, consequences, target);
};

export const decreaseDamageTaken = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { pass, preventTag } = preventCheck(usersEffects, "buffprevent", target);
  if (preventTag && preventTag.createdRound < effect.createdRound) {
    if (!pass) return preventResponse(effect, target, "cannot be buffed");
  }
  effect.power = -Math.abs(effect.power);
  effect.powerPerLevel = -Math.abs(effect.powerPerLevel);
  return adjustDamageTaken(effect, usersEffects, consequences, target);
};

/** Adjust ability to heal other of target */
export const adjustHealGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { power, adverb, qualifier } = getPower(effect);
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      // Adjust heal
      if (consequence.userId === effect.targetId && consequence.heal_hp) {
        const healEffect = usersEffects.find((e) => e.id === effectId);
        if (healEffect) {
          const change =
            effect.calculation === "percentage"
              ? (power / 100) * consequence.heal_hp
              : power;
          consequence.heal_hp = consequence.heal_hp + change;
        }
      }
      // Adjust lifesteal
      if (consequence.userId === effect.targetId && consequence.lifesteal_hp) {
        const stealEffect = usersEffects.find((e) => e.id === effectId);
        if (stealEffect) {
          const change =
            effect.calculation === "percentage"
              ? (power / 100) * consequence.lifesteal_hp
              : power;
          consequence.lifesteal_hp = consequence.lifesteal_hp + change;
        }
      }
    });
  }
  return getInfo(target, effect, `healing ability is ${adverb} by ${qualifier}`);
};

export const increaseHealGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  return adjustHealGiven(effect, usersEffects, consequences, target);
};

export const decreaseHealGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  effect.power = -Math.abs(effect.power);
  effect.powerPerLevel = -Math.abs(effect.powerPerLevel);
  return adjustHealGiven(effect, usersEffects, consequences, target);
};

const removeEffects = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
  type: "positive" | "negative",
) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;

  let text =
    effect.isNew && effect.rounds && effect.rounds > 0
      ? `All ${type} status effects may be cleared from ${target.username} during the next ${effect.rounds} rounds. `
      : "";

  if (mainCheck) {
    text = `${target.username} will be cleared of ${type} status effects on their next round. `;
    effect.rounds = 2;
    effect.power = 100;
  } else {
    text += `${target.username} could not be cleared of ${type} status effects this round. `;
  }

  // Note: add !effect.castThisRound && to remove effects only after the round
  if (effect.power === 100) {
    usersEffects
      .filter((e) => e.targetId === effect.targetId)
      .filter((e) => e.fromType !== "bloodline")
      .filter((e) => e.fromType !== "armor")
      .filter(type === "positive" ? isPositiveUserEffect : isNegativeUserEffect)
      .map((e) => {
        e.rounds = 0;
      });
    text = `${target.username} was cleared of all ${type} status effects. `;
    effect.rounds = 0;
  }
  return { txt: text, color: "blue" } as ActionEffect;
};

export const clear = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  const { pass } = preventCheck(usersEffects, "clearprevent", target);
  if (!pass) return preventResponse(effect, target, "resists being cleared");
  return removeEffects(effect, usersEffects, target, "positive");
};

export const cleanse = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  const { pass } = preventCheck(usersEffects, "cleanseprevent", target);
  if (!pass) return preventResponse(effect, target, "resists being cleansed");
  return removeEffects(effect, usersEffects, target, "negative");
};

/** Clone user on the battlefield */
export const clone = (usersState: BattleUserState[], effect: GroundEffect) => {
  const { power } = getPower(effect);
  const perc = power / 100;
  const user = usersState.find((u) => u.userId === effect.creatorId);
  if (!user) {
    throw new Error("Summoner not found");
  }
  if (effect.isNew) {
    const newAi = structuredClone(user);
    // Place on battlefield
    newAi.userId = nanoid();
    effect.creatorId = newAi.userId;
    newAi.isSummon = true;
    newAi.username = `${user.username} clone`;
    newAi.controllerId = user.userId;
    newAi.isOriginal = false;
    newAi.isAi = true;
    newAi.hidden = undefined;
    newAi.longitude = effect.longitude;
    newAi.latitude = effect.latitude;
    newAi.villageId = user.villageId;
    newAi.direction = user.direction;
    // Set level to summoner level
    newAi.level = user.level;
    // Scale to level
    scaleUserStats(newAi);
    // Set stats
    newAi.ninjutsuOffence = newAi.ninjutsuOffence * perc;
    newAi.ninjutsuDefence = newAi.ninjutsuDefence * perc;
    newAi.genjutsuOffence = newAi.genjutsuOffence * perc;
    newAi.genjutsuDefence = newAi.genjutsuDefence * perc;
    newAi.taijutsuOffence = newAi.taijutsuOffence * perc;
    newAi.taijutsuDefence = newAi.taijutsuDefence * perc;
    newAi.bukijutsuOffence = newAi.bukijutsuOffence * perc;
    newAi.bukijutsuDefence = newAi.bukijutsuDefence * perc;
    newAi.strength = newAi.strength * perc;
    newAi.intelligence = newAi.intelligence * perc;
    newAi.willpower = newAi.willpower * perc;
    newAi.speed = newAi.speed * perc;
    // Remove all jutsus with summon/clone
    newAi.jutsus = newAi.jutsus.filter((j) => {
      const effects = JSON.stringify(j.jutsu.effects);
      return !effects.includes("summon") && !effects.includes("clone");
    });
    // Push to userState
    usersState.push(newAi);
    // ActionEffect to be shown
    return {
      txt: `${newAi.username} created a clone for ${effect.rounds} rounds!`,
      color: "blue",
    } as ActionEffect;
  } else if (effect?.rounds === 0) {
    const idx = usersState.findIndex((u) => u.userId === effect.creatorId);
    if (idx > -1) {
      usersState.splice(idx, 1);
      return {
        txt: `${user.username} disappears!`,
        color: "red",
      } as ActionEffect;
    }
  }
};

export const updateStatUsage = (
  user: BattleUserState,
  effect: UserEffect | GroundEffect,
  inverse = false,
) => {
  if ("statTypes" in effect && "direction" in effect) {
    effect.statTypes?.forEach((statType) => {
      if (
        (effect.direction === "offence" && !inverse) ||
        (effect.direction === "defence" && inverse)
      ) {
        switch (statType) {
          case "Taijutsu":
            user.usedStats.push("taijutsuOffence");
            break;
          case "Bukijutsu":
            user.usedStats.push("bukijutsuOffence");
            break;
          case "Ninjutsu":
            user.usedStats.push("ninjutsuOffence");
            break;
          case "Genjutsu":
            user.usedStats.push("genjutsuOffence");
            break;
          case "Highest":
            user.usedStats.push(user.highestOffence);
            break;
        }
      } else {
        switch (statType) {
          case "Taijutsu":
            user.usedStats.push("taijutsuDefence");
            break;
          case "Bukijutsu":
            user.usedStats.push("bukijutsuDefence");
            break;
          case "Ninjutsu":
            user.usedStats.push("ninjutsuDefence");
            break;
          case "Genjutsu":
            user.usedStats.push("genjutsuDefence");
            break;
          case "Highest":
            user.usedStats.push(user.highestDefence);
            break;
        }
      }
    });
  }
  if ("generalTypes" in effect) {
    effect.generalTypes?.forEach((general) => {
      if (general === "Highest") {
        user.highestGenerals.forEach((gen) => {
          user.usedGenerals.push(gen);
        });
      } else {
        user.usedGenerals.push(general.toLowerCase() as Lowercase<typeof general>);
      }
    });
  }
};

/** Function used for scaling two attributes against each other, used e.g. in damage calculation */
const powerEffect = (
  attack: number,
  defence: number,
  avg_exp: number,
  config: DmgConfig,
) => {
  const statRatio =
    Math.pow(attack, config.atk_scaling) / Math.pow(defence, config.def_scaling);
  return config.dmg_base + statRatio * Math.pow(avg_exp, config.exp_scaling);
};

/** Base damage calculation formula */
export const damageCalc = (
  effect: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState,
  config: DmgConfig,
) => {
  const { power } = getPower(effect);
  const calcs: number[] = [];
  // Run battle formula to get list of calculations for each stat
  if (effect.calculation === "formula") {
    const dir = "offensive";
    effect.statTypes?.forEach((statType) => {
      let a = "";
      let b = "";
      if (statType === "Highest" && effect.highestOffence && effect.highestDefence) {
        if (dir === "offensive") {
          a = effect.highestOffence;
          b = effect.highestOffence.replace("Offence", "Defence");
        } else {
          a = effect.highestDefence;
          b = effect.highestDefence.replace("Defence", "Offence");
        }
      } else {
        const lower = statType.toLowerCase();
        a = `${lower}${dir ? "Offence" : "Defence"}`;
        b = `${lower}${dir ? "Defence" : "Offence"}`;
      }
      if (origin && a in origin && b in target) {
        const left = origin[a as keyof typeof origin] as number;
        const right = target[b as keyof typeof target] as number;
        const avg_exp = (origin.experience + target.experience) / 2;
        calcs.push(config.stats_scaling * powerEffect(left, right, avg_exp, config));
      }
    });
    // Apply an element of all these generals
    const generals = getLowerGenerals(effect.generalTypes, origin?.highestGenerals);
    generals.forEach((gen) => {
      if (origin && gen in origin && gen in target) {
        const left = origin[gen as keyof typeof origin] as number;
        const right = target[gen as keyof typeof target] as number;
        const avg_exp = (origin.experience + target.experience) / 2;
        calcs.push(config.gen_scaling * powerEffect(left, right, avg_exp, config));
      }
    });
  }
  // Calculate final damage
  const calcSum = calcs.reduce((a, b) => a + b, 0);
  const calcMean = calcSum / calcs.length;
  const base = 1 + power * config.power_scaling;
  let dmg =
    calcSum > 0 ? base * calcMean * config.dmg_scaling + config.dmg_base : power;
  // If residual
  if (!effect.castThisRound && "residualModifier" in effect) {
    if (effect.residualModifier) dmg *= effect.residualModifier;
  }
  // Modify damage
  if ("dmgModifier" in effect) {
    if (effect.dmgModifier) dmg *= effect.dmgModifier;
  }
  return dmg;
};

/** Calculate damage effect on target */
export const damageUser = (
  effect: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState,
  consequences: Map<string, Consequence>,
  applyTimes: number,
  config: DmgConfig,
) => {
  const damage =
    damageCalc(effect, origin, target, config) *
    applyTimes *
    (1 - effect.barrierAbsorb);
  const types = [
    ...("statTypes" in effect && effect.statTypes ? effect.statTypes : []),
    ...("generalTypes" in effect && effect.generalTypes ? effect.generalTypes : []),
    ...("elements" in effect && effect.elements ? effect.elements : []),
    ...("poolsAffected" in effect && effect.poolsAffected ? effect.poolsAffected : []),
  ];
  const thisRound = effect.castThisRound;
  const instant = thisRound && effect.rounds === 0;
  const residual = !thisRound && (effect.rounds === undefined || effect.rounds > 0);
  if (instant || residual) {
    consequences.set(effect.id, {
      userId: effect.creatorId,
      targetId: effect.targetId,
      types: types,
      ...(instant ? { damage: damage } : {}),
      ...(residual ? { residual: damage } : {}),
    });
  }
  return getInfo(target, effect, "will take damage");
};

/** Apply damage effect to barrier */
export const damageBarrier = (
  groundEffects: GroundEffect[],
  origin: BattleUserState,
  effect: UserEffect,
  config: DmgConfig,
) => {
  // Get the barrier
  const idx = groundEffects.findIndex((g) => g.id === effect.targetId);
  const barrier = groundEffects[idx];
  if (!barrier || !("curHealth" in barrier)) return undefined;
  const { power } = getPower(barrier);
  // Create barrier target user stats
  const target = structuredClone(origin);
  target.level = power;
  scaleUserStats(target);
  // Calculate damage
  const damage = damageCalc(effect, origin, target, config) * effect.barrierAbsorb;
  barrier.curHealth -= damage;
  // Information
  if (barrier.curHealth <= 0) {
    groundEffects.splice(idx, 1);
  }
  const info: ActionEffect = {
    txt: `Barrier takes ${damage.toFixed(2)} damage ${
      barrier.curHealth <= 0
        ? "and is destroyed."
        : `and has ${barrier.curHealth.toFixed(2)} health left.`
    }`,
    color: "red",
  };
  return { info, barrier };
};

/** Flee from the battlefield with a given chance */
export const flee = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  const { pass } = preventCheck(usersEffects, "fleeprevent", target);
  if (!pass) return preventResponse(effect, target, "is prevented from fleeing");
  // Apply flee
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  let text =
    effect.isNew && effect.rounds && effect.rounds > 0
      ? `${target.username} will attempt fleeing for the next ${effect.rounds} rounds. `
      : "";
  if (primaryCheck) {
    target.fledBattle = true;
    text = `${target.username} manages to flee the battle!`;
  } else {
    text += `${target.username} fails to flee the battle!`;
  }

  return { txt: text, color: "blue" } as ActionEffect;
};

/** Check if flee prevent is successful depending on static chance calculation */
export const fleePrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "cannot flee");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Calculate healing effect on target */
export const heal = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
  consequences: Map<string, Consequence>,
  applyTimes: number,
) => {
  // Prevent?
  const { pass } = preventCheck(usersEffects, "healprevent", target);
  if (!pass) return preventResponse(effect, target, "cannot be healed");
  // Calculate healing
  const { power } = getPower(effect);
  const parsedEffect = HealTag.parse(effect);
  const poolsAffects = parsedEffect.poolsAffected || ["Health"];
  const heal_hp = poolsAffects.includes("Health")
    ? effect.calculation === "percentage"
      ? target.maxHealth * (power / 100) * applyTimes
      : power * applyTimes
    : 0;
  const heal_sp = poolsAffects.includes("Stamina")
    ? effect.calculation === "percentage"
      ? target.maxStamina * (power / 100) * applyTimes
      : power * applyTimes
    : 0;
  const heal_cp = poolsAffects.includes("Chakra")
    ? effect.calculation === "percentage"
      ? target.maxChakra * (power / 100) * applyTimes
      : power * applyTimes
    : 0;
  // If rounds=0 apply immidiately, otherwise only on following rounds
  if (
    (effect.castThisRound && effect.rounds === 0) ||
    (!effect.castThisRound && (effect.rounds === undefined || effect.rounds > 0))
  ) {
    consequences.set(effect.id, {
      userId: effect.creatorId,
      targetId: effect.targetId,
      heal_hp,
      heal_sp,
      heal_cp,
    });
  }
  return getInfo(target, effect, "will heal");
};

/** Prevent healing */
export const healPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    const info = getInfo(target, effect, "cannot be healed");
    return info;
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

export const pooladjust = (effect: UserEffect, target: BattleUserState) => {
  const { adverb, qualifier } = getPower(effect);
  if ("poolsAffected" in effect) {
    const affected: string[] = [];
    effect.poolsAffected?.forEach((pool) => {
      affected.push(pool);
    });
    return getInfo(
      target,
      effect,
      `${affected.join(", ")} cost is ${adverb} by ${qualifier}`,
    );
  }
};

export const increasepoolcost = (effect: UserEffect, target: BattleUserState) => {
  return pooladjust(effect, target);
};

export const decreasepoolcost = (effect: UserEffect, target: BattleUserState) => {
  effect.power = -Math.abs(effect.power);
  effect.powerPerLevel = -Math.abs(effect.powerPerLevel);
  return pooladjust(effect, target);
};

/** Reflect damage back to the opponent */
export const reflect = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { power, qualifier } = getPower(effect);
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (consequence.targetId === effect.targetId && consequence.damage) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const convert =
            Math.floor(
              effect.calculation === "percentage"
                ? consequence.damage * (power / 100)
                : power > consequence.damage
                  ? consequence.damage
                  : power,
            ) * ratio;
          // consequence.damage -= convert;
          consequence.reflect = convert;
        }
      }
    });
  }
  return getInfo(target, effect, `will reflect ${qualifier} damage`);
};

/** Recoil damage back to attacker */
export const recoil = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  const { power, qualifier } = getPower(effect);
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (consequence.userId === effect.targetId && consequence.damage) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const convert =
            Math.floor(
              effect.calculation === "percentage"
                ? consequence.damage * (power / 100)
                : power > consequence.damage
                  ? consequence.damage
                  : power,
            ) * ratio;
          consequence.recoil = convert;
        }
      }
    });
  }
  return getInfo(target, effect, `will recoil ${qualifier} damage`);
};

/** Steal damage back to attacker as HP */
export const lifesteal = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState,
) => {
  // Prevent?
  const { pass } = preventCheck(usersEffects, "healprevent", target);
  if (!pass) return preventResponse(effect, target, "cannot steal health");
  // Calculate life steal
  const { power, qualifier } = getPower(effect);
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (consequence.userId === effect.targetId && consequence.damage) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const convert = Math.floor(consequence.damage * (power / 100)) * ratio;
          consequence.lifesteal_hp = convert;
        }
      }
    });
  }
  return getInfo(target, effect, `will steal ${qualifier} damage as health`);
};

/**
 * Move user on the battlefield
 * 1. Remove user from current ground effect
 * 2. Add user to any new ground effect
 * 3. Move user
 */
export const move = (
  effect: GroundEffect,
  usersEffects: UserEffect[],
  usersState: BattleUserState[],
  groundEffects: GroundEffect[],
) => {
  const user = usersState.find((u) => u.userId === effect.creatorId);
  let info: ActionEffect | undefined = undefined;
  if (user) {
    // Prevent?
    const { pass } = preventCheck(usersEffects, "moveprevent", user);
    if (!pass) return preventResponse(effect, user, "resisted being stunned");
    // Update movement information
    info = {
      txt: `${user.username} moves to [${effect.latitude}, ${effect.longitude}]`,
      color: "blue",
    };
    // This is related to users stepping into/out of ground effects
    groundEffects.forEach((g) => {
      if (g.timeTracker && user.userId in g.timeTracker) {
        delete g.timeTracker[user.userId];
      }
    });
    groundEffects.forEach((g) => {
      if (
        g.timeTracker &&
        g.longitude === effect.longitude &&
        g.latitude === effect.latitude
      ) {
        g.timeTracker[user.userId] = effect.createdRound;
      }
    });
    // Update user location. If someone else is already standing on the spot,
    // move to the nearest available spot on the most direct line between
    // the current and target location
    user.longitude = effect.longitude;
    user.latitude = effect.latitude;
  }
  return info;
};

/** Prevent target from moving */
export const movePrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "cannot move");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** One-hit-kill target with a given static chance */
export const onehitkill = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  // Prevent?
  const { pass } = preventCheck(usersEffects, "onehitkillprevent", target);
  if (!pass) return preventResponse(effect, target, "resisted being instantly killed");
  // Apply
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  let info: ActionEffect | undefined = undefined;
  if (primaryCheck) {
    target.curHealth = 0;
    info = { txt: `${target.username} was killed in one hit`, color: "red" };
  } else {
    info = {
      txt: `${target.username} was lucky not to be instantly killed!`,
      color: "blue",
    };
  }
  return info;
};

/** Status effect to prevent OHKO */
export const onehitkillPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "cannot be one-hit-killed");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Rob a given user for a given amount of ryo */
export const rob = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  origin: BattleUserState,
  target: BattleUserState,
  battleType: BattleType,
): ActionEffect | undefined => {
  // No stealing from AIs
  if (target.isAi) {
    effect.rounds = 0;
    return { txt: `${target.username} is an AI and cannot be robbed`, color: "blue" };
  }
  if (battleType !== "COMBAT") {
    effect.rounds = 0;
    return { txt: `You can only rob in 1vs1 combat`, color: "blue" };
  }
  // Prevent?
  const { pass } = preventCheck(usersEffects, "robprevent", target);
  if (!pass) return preventResponse(effect, target, "resisted being robbed");
  // Convenience. if rounds=0, it's an instant rob, otherwise chance every active round
  const thisRound = effect.castThisRound;
  const instant = thisRound && effect.rounds === 0;
  const residual = !thisRound && (effect.rounds === undefined || effect.rounds > 0);
  // Attempt robbing
  const { power } = getPower(effect);
  if (instant || residual) {
    const primaryCheck = Math.random() < power / 100;
    if (primaryCheck && "robPercentage" in effect && effect.robPercentage) {
      const targetMoney = target.money - target.moneyStolen;
      let stolen = Math.floor(targetMoney * (effect.robPercentage / 100));
      stolen = Math.floor(stolen > targetMoney ? targetMoney : stolen);
      if (stolen > 0) {
        origin.moneyStolen += stolen;
        target.moneyStolen -= stolen;
        return {
          txt: `${origin.username} stole ${stolen} ryo from ${target.username}`,
          color: "blue",
        };
      } else {
        return {
          txt: `${origin.username} failed to steal ryo from ${target.username} but there was nothing more to steal`,
          color: "blue",
        };
      }
    } else {
      return { txt: `${target.username} manages not to get robbed!`, color: "blue" };
    }
  }
  return getInfo(target, effect, "will be robbed");
};

/** Prevent robbing */
export const robPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "cannot be robbed");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Prevent cleansing */
export const cleansePrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "cannot be cleansed");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Prevent clearing */
export const clearPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  console.log(mainCheck);
  if (mainCheck) {
    const info = getInfo(target, effect, "cannot be cleared");
    console.log(info);
    return info;
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Seal the bloodline effects of the target with static chance */
export const seal = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  const { pass } = preventCheck(usersEffects, "sealprevent", target);
  if (!pass) return preventResponse(effect, target, "resisted bloodline sealing");
  // Apply
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  let info: ActionEffect | undefined = undefined;
  if (effect.isNew) {
    if (primaryCheck) {
      info = getInfo(target, effect, "bloodline is sealed");
    } else {
      effect.rounds = 0;
      info = { txt: `${target.username} bloodline was not sealed`, color: "blue" };
    }
  }
  return info;
};

/** Check if a given effect is sealed based on a list of pre-filtered user effects */
export const sealCheck = (effect: UserEffect, sealEffects: UserEffect[]) => {
  if (sealEffects.length > 0 && effect.fromType === "bloodline") {
    const sealEffect = sealEffects.find((e) => e.targetId === effect.targetId);
    if (sealEffect) {
      return true;
    }
  }
  return false;
};

/** Prevent sealing of bloodline effects with a static chance */
export const sealPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "bloodline cannot be sealed");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Go into stealth mode */
export const stealth = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    const info = getInfo(target, effect, "will be stealthed");
    return info;
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Stun target based on static chance */
export const stun = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState,
) => {
  // Prevent?
  const { pass } = preventCheck(usersEffects, "stunprevent", target);
  if (!pass) return preventResponse(effect, target, "resisted being stunned");
  // Apply
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  let info: ActionEffect | undefined = undefined;
  if (effect.isNew && effect.rounds) {
    if (!("apReduction" in effect)) {
      effect.rounds = 0;
      info = { txt: `${target.username} hit with inactive stun effect`, color: "blue" };
    } else if (primaryCheck) {
      info = getInfo(target, effect, `is stunned [-${effect.apReduction} AP]`);
    } else {
      effect.rounds = 0;
      info = { txt: `${target.username} manages not to get stunned!`, color: "blue" };
    }
  }
  return info;
};

/** Prevent target from being stunned */
export const stunPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "cannot be stunned");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/** Clone user on the battlefield */
export const summon = (usersState: BattleUserState[], effect: GroundEffect) => {
  const { power } = getPower(effect);
  const perc = power / 100;
  const user = usersState.find((u) => u.userId === effect.creatorId);
  if (!("aiId" in effect)) {
    throw new Error("Summon effect must have aiId");
  }
  if (effect.isNew && effect.castThisRound) {
    effect.isNew = false;
    if (user && "aiHp" in effect) {
      const ai = usersState.find((u) => u.userId === effect.aiId);
      const obj = usersState.find((u) => u.username === ai?.username && u.curHealth);
      if (ai && !obj) {
        const newAi = structuredClone(ai);
        // Place on battlefield
        newAi.userId = nanoid();
        effect.aiId = newAi.userId;
        newAi.controllerId = user.userId;
        newAi.hidden = undefined;
        newAi.longitude = effect.longitude;
        newAi.latitude = effect.latitude;
        newAi.villageId = user.villageId;
        newAi.direction = user.direction;
        // Set level to summoner level
        newAi.level = user.level;
        // Scale to level
        scaleUserStats(newAi);
        // Set pools
        newAi.maxHealth = effect.aiHp;
        newAi.curHealth = newAi.maxHealth;
        // Set stats
        newAi.ninjutsuOffence = newAi.ninjutsuOffence * perc;
        newAi.ninjutsuDefence = newAi.ninjutsuDefence * perc;
        newAi.genjutsuOffence = newAi.genjutsuOffence * perc;
        newAi.genjutsuDefence = newAi.genjutsuDefence * perc;
        newAi.taijutsuOffence = newAi.taijutsuOffence * perc;
        newAi.taijutsuDefence = newAi.taijutsuDefence * perc;
        newAi.bukijutsuOffence = newAi.bukijutsuOffence * perc;
        newAi.bukijutsuDefence = newAi.bukijutsuDefence * perc;
        newAi.strength = newAi.strength * perc;
        newAi.intelligence = newAi.intelligence * perc;
        newAi.willpower = newAi.willpower * perc;
        newAi.speed = newAi.speed * perc;
        // Push to userState
        usersState.push(newAi);
        // ActionEffect to be shown
        return {
          txt: `${newAi.username} was summoned for ${effect.rounds} rounds!`,
          color: "blue",
        } as ActionEffect;
      }
    }
    // If return from here, summon failed
    effect.rounds = 0;
    return { txt: `Failed to create summon!`, color: "red" } as ActionEffect;
  } else if (effect?.rounds === 0) {
    const ai = usersState.find((u) => u.userId === effect.aiId);
    const idx = usersState.findIndex((u) => u.userId === effect.aiId);
    if (ai && idx > -1) {
      usersState.splice(idx, 1);
      return { txt: `${ai.username} was unsummoned!`, color: "red" } as ActionEffect;
    }
  }
};

/** Prevent target from being stunned */
export const summonPrevent = (effect: UserEffect, target: BattleUserState) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  if (mainCheck) {
    return getInfo(target, effect, "cannot summon companions");
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
};

/**
 * ***********************************************
 *              UTILITY METHODS
 * ***********************************************
 */

/**
 * Prevention response from the target user
 */
export const preventResponse = (
  effect: UserEffect | GroundEffect,
  target: BattleUserState,
  msg: string,
) => {
  effect.rounds = 0;
  return {
    txt: `${target.username} ${msg}`,
    color: "blue",
  } as ActionEffect;
};

/**
 * Returns an array of lowercase generals based on the input array of generals and the user's highest generals.
 * If the input array contains the value "Highest", the function will include the user's highest generals in the result.
 *
 * @param generals - An array of GeneralType values.
 * @param user - An optional BattleUserState object.
 * @returns An array of lowercase generals.
 */
export const getLowerGenerals = (
  generals?: GeneralType[],
  highestGenerals?: (typeof GenNames)[number][],
) => {
  return [
    ...(generals?.filter((g) => g !== "Highest").map((g) => g.toLowerCase()) || []),
    ...(generals?.find((g) => g === "Highest") ? highestGenerals || [] : []),
  ];
};

const getInfo = (
  target: BattleUserState,
  e: UserEffect,
  msg: string,
): ActionEffect | undefined => {
  if (e.isNew && e.rounds) {
    return {
      txt: `${target.username} ${msg} for the next ${e.rounds} rounds`,
      color: "blue",
    };
  }
  return undefined;
};

/** Convenience method used by a lot of tags */
export const getPower = (effect: UserEffect | GroundEffect) => {
  let power = effect.power + effect.level * effect.powerPerLevel;
  if (effect.calculation === "percentage") {
    power = power > 100 ? 100 : power;
  }
  const adverb = power > 0 ? "increased" : "decreased";
  const value = Math.abs(power);
  const qualifier = effect.calculation === "percentage" ? `${value}%` : value;
  return { power, adverb, qualifier };
};

/** Convert from e.g. ninjutsuOffence -> Ninjutsu */
export const getStatTypeFromStat = (stat: (typeof StatNames)[number]) => {
  switch (stat) {
    case "ninjutsuOffence":
      return "Ninjutsu";
    case "ninjutsuDefence":
      return "Ninjutsu";
    case "genjutsuOffence":
      return "Genjutsu";
    case "genjutsuDefence":
      return "Genjutsu";
    case "taijutsuOffence":
      return "Taijutsu";
    case "taijutsuDefence":
      return "Taijutsu";
    case "bukijutsuOffence":
      return "Bukijutsu";
    case "bukijutsuDefence":
      return "Bukijutsu";
    default:
      throw Error("Invalid stat type");
  }
};
/**
 * Calculate ratio of user stats & elements between one user effect to another
 * Returns a ratio between 0 to 1, 0 indicating e.g. that none of the stats in LHS are
 * matched in the RHS, whereas a ratio of 1 means everything is matched by a value in RHS
 */
const getEfficiencyRatio = (dmgEffect: UserEffect, effect: UserEffect) => {
  // We need to get the list of dmgEffect stats/gens/elements and effect stats/gens/elements
  const getTags = (e: UserEffect) => {
    const tags: string[] = [];
    if ("statTypes" in e) {
      e.statTypes?.forEach((statType) =>
        tags.push(
          statType === "Highest" && e.highestOffence
            ? getStatTypeFromStat(e.highestOffence)
            : statType,
        ),
      );
    }
    if ("generalTypes" in e) {
      tags.push(...getLowerGenerals(e.generalTypes, e.highestGenerals));
    }
    if ("elements" in e && e.elements && e.elements.length > 0) {
      tags.push(...e.elements);
    } else {
      tags.push("None");
    }
    return tags;
  };
  const dmgTags = getTags(dmgEffect);
  const effectTags = getTags(effect);

  // Ratio for whether to apply the effect or not
  let baseRatio = false;
  dmgTags.forEach((stat) => {
    if (effectTags.includes(stat)) {
      baseRatio = true;
    }
  });
  return baseRatio ? 1 : 0;
};

/**
 * Checks for a given prevent action, e.g. stunprevent, fleeprevent, etc.
 * if true, then the action is not prevented, if false then the check failed and the prevent is applied
 */
const preventCheck = (
  usersEffects: UserEffect[],
  type: string,
  target: BattleUserState,
) => {
  const preventTag = usersEffects.find(
    (e) => e.type == type && e.targetId === target.userId && !e.castThisRound,
  );
  if (preventTag) {
    const power = preventTag.power + preventTag.level * preventTag.powerPerLevel;
    return { pass: Math.random() > power / 100, preventTag: preventTag };
  }
  return { pass: true, preventTag: preventTag };
};
