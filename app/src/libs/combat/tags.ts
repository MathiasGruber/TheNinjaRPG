import type { BattleUserState, Consequence, ReturnedBattle } from "./types";
import type { GroundEffect, UserEffect, ActionEffect } from "./types";
import { ATK_SCALING, DEF_SCALING, EXP_SCALING, GEN_SCALING } from "./constants";
import { DMG_BASE, DMG_SCALING, POWER_SCALING } from "./constants";
import { shouldApplyEffectTimes } from "./util";
import { nanoid } from "nanoid";

/** Absorb damage & convert it to healing */
export const absorb = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState
) => {
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
      if (consequence.targetId === effect.targetId && consequence.damage) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const convert =
            Math.ceil(
              effect.calculation === "percentage"
                ? consequence.damage * (power / 100)
                : power > consequence.damage
                ? consequence.damage
                : power
            ) * ratio;
          consequence.damage -= convert;
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
    `will absorb up to ${qualifier} damage and convert it to ${pools.join(", ")}`
  );
};

/** Adjust armor by a static amount */
export const adjustArmor = (effect: UserEffect, target: BattleUserState) => {
  if (!effect.isNew && !effect.castThisRound) {
    const { power, adverb, qualifier } = getPower(effect);
    target.armor += power;
  }
  return getInfo(target, effect, `armor is ${adverb} by ${qualifier}`);
};

/** Adjust stats of target based on effect */
export const adjustStats = (effect: UserEffect, target: BattleUserState) => {
  const { power, adverb, qualifier } = getPower(effect);
  const affected: string[] = [];
  if (!effect.isNew && !effect.castThisRound) {
    if ("calculation" in effect && "statTypes" in effect) {
      effect.statTypes?.forEach((stat) => {
        if (stat === "Highest") {
          if (effect.calculation === "static") {
            target.highestOffence += power;
            target.highestDefence += power;
          } else if (effect.calculation === "percentage") {
            target.highestOffence *= (100 + power) / 100;
            target.highestDefence *= (100 + power) / 100;
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
        if (general === "Strength") {
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
      if (effect.statTypes) affected.push(...effect.statTypes);
      if (effect.generalTypes) affected.push(...effect.generalTypes);
    }
  }
  return getInfo(target, effect, `${affected.join(", ")} is ${adverb} by ${qualifier}`);
};

/** Adjust damage given by target */
export const adjustDamageGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState
) => {
  const { power, adverb, qualifier } = getPower(effect);
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
  return getInfo(target, effect, `damage given is ${adverb} by ${qualifier}`);
};

/** Adjust damage taken by user */
export const adjustDamageTaken = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState
) => {
  const { power, adverb, qualifier } = getPower(effect);
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
          consequence.damage = consequence.damage - change * ratio;
        }
      }
    });
  }
  return getInfo(target, effect, `damage taken is ${adverb} by ${qualifier}`);
};

/** Adjust ability to heal other of target */
export const adjustHealGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState
) => {
  const { power, adverb, qualifier } = getPower(effect);
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (consequence.userId === effect.targetId && consequence.heal) {
        const healEffect = usersEffects.find((e) => e.id === effectId);
        if (healEffect) {
          const ratio = getEfficiencyRatio(healEffect, effect);
          const change =
            effect.calculation === "percentage"
              ? (power / 100) * consequence.heal
              : power;
          consequence.heal = consequence.heal + change * ratio;
        }
      }
    });
  }
  return getInfo(target, effect, `healing capacity is ${adverb} by ${qualifier}`);
};

export const clear = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState
) => {
  const { power } = getPower(effect);
  const mainCheck = Math.random() < power / 100;
  let info: ActionEffect | undefined = undefined;
  if (mainCheck) {
    usersEffects
      .filter((e) => e.targetId === effect.targetId)
      .forEach((e) => {
        e.rounds = 0;
      });
    info = {
      txt: `${target.username} was cleared of all status effects`,
      color: "blue",
    };
  } else if (effect.isNew) {
    effect.rounds = 0;
  }
  return info;
};

/** Clone user on the battlefield */
export const clone = (usersState: BattleUserState[], effect: GroundEffect) => {
  const user = usersState.find((u) => u.userId === effect.creatorId);
  if (user && effect.power) {
    const perc = effect.power / 100;
    user.maxHealth = user.maxHealth * perc;
    user.maxChakra = user.maxChakra * perc;
    user.maxStamina = user.maxStamina * perc;
    user.curHealth = user.curHealth * perc;
    user.curChakra = user.curChakra * perc;
    user.curStamina = user.curStamina * perc;
    user.ninjutsuOffence = user.ninjutsuOffence * perc;
    user.ninjutsuDefence = user.ninjutsuDefence * perc;
    user.genjutsuOffence = user.genjutsuOffence * perc;
    user.genjutsuDefence = user.genjutsuDefence * perc;
    user.taijutsuOffence = user.taijutsuOffence * perc;
    user.taijutsuDefence = user.taijutsuDefence * perc;
    user.bukijutsuOffence = user.bukijutsuOffence * perc;
    user.bukijutsuDefence = user.bukijutsuDefence * perc;
    user.highestOffence = user.highestOffence * perc;
    user.highestDefence = user.highestDefence * perc;
    user.strength = user.strength * perc;
    user.intelligence = user.intelligence * perc;
    user.willpower = user.willpower * perc;
    user.speed = user.speed * perc;
    usersState.push({
      ...user,
      userId: nanoid(),
      longitude: effect.longitude,
      latitude: effect.latitude,
      isOriginal: false,
    });
    return true;
  }
  return false;
};

export const updateStatUsage = (
  user: BattleUserState,
  effect: UserEffect | GroundEffect,
  inverse = false
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
            user.usedStats.push(user.highestOffence_type);
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
            user.usedStats.push(user.highestDefence_type);
            break;
        }
      }
    });
  }
  if ("generalTypes" in effect) {
    effect.generalTypes?.forEach((general) => {
      user.usedGenerals.push(general);
    });
  }
};

/** Function used for scaling two attributes against each other, used e.g. in damage calculation */
const powerEffect = (attack: number, defence: number, avg_exp: number) => {
  const statRatio = Math.pow(attack, ATK_SCALING) / Math.pow(defence, DEF_SCALING);
  return DMG_BASE + statRatio * Math.pow(avg_exp, EXP_SCALING);
};

/** Calculate damage effect on target */
export const damage = (
  effect: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState,
  consequences: Map<string, Consequence>,
  applyTimes: number
) => {
  const { power } = getPower(effect);
  const calcs: number[] = [];
  // Run battle formula to get list of calculations for each stat
  if ("calculation" in effect && effect.calculation === "formula") {
    const dir = "offensive";
    effect.statTypes?.forEach((statType) => {
      const lower = statType.toLowerCase();
      const a = `${lower}${dir ? "Offence" : "Defence"}`;
      const b = `${lower}${dir ? "Defence" : "Offence"}`;
      if (effect.fromGround && a in effect && b in target && effect.experience) {
        const left = effect[a as keyof typeof effect] as number;
        const right = target[b as keyof typeof target] as number;
        const avg_exp = (effect.experience + target.experience) / 2;
        calcs.push(powerEffect(left, right, avg_exp));
      } else if (origin && a in origin && b in target) {
        const left = origin[a as keyof typeof origin] as number;
        const right = target[b as keyof typeof target] as number;
        const avg_exp = (origin.experience + target.experience) / 2;
        calcs.push(powerEffect(left, right, avg_exp));
      }
    });
    effect.generalTypes?.forEach((generalType) => {
      const gen = generalType.toLowerCase();
      if (effect.fromGround && gen in effect && gen in target && effect.experience) {
        const left = effect[gen as keyof typeof effect] as number;
        const right = target[gen as keyof typeof target] as number;
        const avg_exp = (effect.experience + target.experience) / 2;
        calcs.push(GEN_SCALING * powerEffect(left, right, avg_exp));
      } else if (origin && gen in origin && gen in target) {
        const left = origin[gen as keyof typeof origin] as number;
        const right = target[gen as keyof typeof target] as number;
        const avg_exp = (origin.experience + target.experience) / 2;
        calcs.push(GEN_SCALING * powerEffect(left, right, avg_exp));
      }
    });
  }
  // Calculate final damage
  const calcSum = calcs.reduce((a, b) => a + b, 0);
  const calcMean = calcSum / calcs.length;
  const base = 1 + power * POWER_SCALING;
  const dmg = calcSum > 0 ? base * calcMean * DMG_SCALING + DMG_BASE : power;
  // Add & return consequence
  consequences.set(effect.id, {
    userId: effect.creatorId,
    targetId: effect.targetId,
    damage: dmg * applyTimes,
  });
  return getInfo(target, effect, "will take damage");
};

/** Apply damage effect to barrier */
export const damageBarrier = (battle: ReturnedBattle, effect: UserEffect) => {
  const { groundEffects } = battle;
  const idx = groundEffects.findIndex((g) => g.id === effect.targetId);
  const barrier = groundEffects[idx];
  if (barrier && barrier.power && effect.power) {
    const applyTimes = shouldApplyEffectTimes(effect, battle, barrier.id);
    if (applyTimes > 0) {
      barrier.power -= effect.power * applyTimes;
      if (barrier.power <= 0) {
        groundEffects.splice(idx, 1);
      }
      const info: ActionEffect = {
        txt: `Barrier takes ${effect.power} damage ${
          barrier.power <= 0
            ? "and is destroyed."
            : `and has ${barrier.power} power left.`
        }`,
        color: "red",
      };
      return { info, barrier };
    }
  }
};

/** Flee from the battlefield with a given chance */
export const flee = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState
) => {
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  const secondaryCheck = preventCheck(usersEffects, "fleeprevent", target);

  let info: ActionEffect | undefined = undefined;
  if (primaryCheck && secondaryCheck) {
    target.fledBattle = true;
    info = { txt: `${target.username} manages to flee the battle!`, color: "blue" };
  } else if (primaryCheck) {
    info = { txt: `${target.username} is prevented from fleeing`, color: "blue" };
  } else {
    info = { txt: `${target.username} fails to flee the battle!`, color: "blue" };
  }
  return info;
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
  target: BattleUserState,
  consequences: Map<string, Consequence>,
  applyTimes: number
) => {
  const { power } = getPower(effect);
  const heal =
    effect.calculation === "percentage"
      ? target.maxHealth * (power / 100) * applyTimes
      : power * applyTimes;
  consequences.set(effect.id, {
    userId: effect.creatorId,
    targetId: effect.targetId,
    heal,
  });
  return getInfo(target, effect, "will heal");
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
      `${affected.join(", ")} cost is ${adverb} by ${qualifier}`
    );
  }
};

/** Reflect damage back to the opponent */
export const reflect = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState
) => {
  const { power } = getPower(effect);
  if (!effect.isNew && !effect.castThisRound) {
    consequences.forEach((consequence, effectId) => {
      if (consequence.targetId === effect.targetId && consequence.damage) {
        const damageEffect = usersEffects.find((e) => e.id === effectId);
        if (damageEffect) {
          const ratio = getEfficiencyRatio(damageEffect, effect);
          const convert =
            Math.ceil(
              effect.calculation === "percentage"
                ? consequence.damage * (power / 100)
                : power > consequence.damage
                ? consequence.damage
                : power
            ) * ratio;
          consequence.damage -= convert;
          consequence.reflect = convert;
        }
      }
    });
  }
  return getInfo(target, effect, "will reflect damage");
};

/**
 * Move user on the battlefield
 * 1. Remove user from current ground effect
 * 2. Add user to any new ground effect
 * 3. Move user
 */
export const move = (
  effect: GroundEffect,
  usersState: BattleUserState[],
  groundEffects: GroundEffect[]
) => {
  const user = usersState.find((u) => u.userId === effect.creatorId);
  let info: ActionEffect | undefined = undefined;
  if (user) {
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
        g.timeTracker[user.userId] = Date.now();
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

/** One-hit-kill target with a given static chance */
export const onehitkill = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState
) => {
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  const secondaryCheck = preventCheck(usersEffects, "onehitkillprevent", target);

  let info: ActionEffect | undefined = undefined;
  if (primaryCheck && secondaryCheck) {
    target.curHealth = 0;
    info = { txt: `${target.username} was killed`, color: "red" };
  } else if (primaryCheck) {
    effect.rounds = 0;
    info = { txt: `${target.username} resisted being killed`, color: "blue" };
  } else {
    info = { txt: `${target.username} was lucky not to get killed!`, color: "blue" };
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
  origin: BattleUserState | undefined,
  target: BattleUserState
) => {
  let stolen = 0;
  let info: ActionEffect | undefined = undefined;
  const check = preventCheck(usersEffects, "robprevent", target);
  if (!check) {
    info = { txt: `${target.username} resists being robbed`, color: "blue" };
  } else if (origin) {
    const { power } = getPower(effect);
    if ("calculation" in effect && effect.calculation === "formula") {
      let ratio = power;
      effect.statTypes?.forEach((statType) => {
        const lower = statType.toLowerCase();
        const a = `${lower}Offence`;
        const b = `${lower}Defence`;
        if (effect.fromGround && a in effect && b in target) {
          const left = effect[a as keyof typeof effect] as number;
          const right = target[b as keyof typeof target] as number;
          ratio *= left / right;
        } else if (origin && a in origin && b in target) {
          const left = origin[a as keyof typeof origin] as number;
          const right = target[b as keyof typeof target] as number;
          ratio *= left / right;
        }
      });
      effect.generalTypes?.forEach((generalType) => {
        const lower = generalType.toLowerCase();
        if (effect.fromGround && lower in effect && lower in target) {
          const left = effect[lower as keyof typeof effect] as number;
          const right = target[lower as keyof typeof target] as number;
          ratio *= left / right;
        } else if (origin && lower in origin && lower in target) {
          const left = origin[lower as keyof typeof origin] as number;
          const right = target[lower as keyof typeof target] as number;
          ratio *= left / right;
        }
      });
      stolen = target.money * (ratio / 100);
    } else if (effect.calculation === "static") {
      stolen = power;
    } else if (effect.calculation === "percentage") {
      stolen = target.money * (power / 100);
    }
    stolen = stolen > target.money ? target.money : stolen;
    origin.money += stolen;
    target.money -= stolen;
    info = {
      txt: `${origin.username} stole ${stolen} ryo from ${target.username}`,
      color: "blue",
    };
  }
  return info;
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

/** Seal the bloodline effects of the target with static chance */
export const seal = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState
) => {
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  const secondaryCheck = preventCheck(usersEffects, "sealprevent", target);

  let info: ActionEffect | undefined = undefined;
  if (primaryCheck && secondaryCheck) {
    info = getInfo(target, effect, "bloodline is sealed");
  } else if (primaryCheck) {
    effect.rounds = 0;
    info = { txt: `${target.username} resisted bloodline sealing`, color: "blue" };
  } else {
    info = { txt: `${target.username} bloodline was not sealed`, color: "blue" };
  }
  return info;
};

/** Check if a given effect is sealed based on a list of pre-filtered user effects */
export const sealCheck = (effect: UserEffect, sealEffects: UserEffect[]) => {
  if (sealEffects.length > 0 && effect.fromBloodline) {
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

/** Stun target based on static chance */
export const stun = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  target: BattleUserState
) => {
  const { power } = getPower(effect);
  const primaryCheck = Math.random() < power / 100;
  const secondaryCheck = preventCheck(usersEffects, "stunprevent", target);

  let info: ActionEffect | undefined = undefined;
  if (primaryCheck && secondaryCheck) {
    info = getInfo(target, effect, "is stunned");
  } else if (primaryCheck) {
    effect.rounds = 0;
    info = { txt: `${target.username} resisted being stunned`, color: "blue" };
  } else {
    info = { txt: `${target.username} manages not to be stunned!`, color: "blue" };
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

/**
 * ***********************************************
 *              UTILITY METHODS
 * ***********************************************
 */

const getInfo = (target: BattleUserState, effect: UserEffect, msg: string) => {
  if (effect.isNew && effect.rounds) {
    const info: ActionEffect = {
      txt: `${target.username} ${msg} for the next ${effect.rounds} rounds`,
      color: "blue",
    };
    return info;
  }
  return undefined;
};

/** Convenience method used by a lot of tags */
export const getPower = (effect: UserEffect) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
  const adverb = power > 0 ? "increased" : "decreased";
  const qualifier = effect.calculation === "percentage" ? `${power}%` : power;
  return { power, adverb, qualifier };
};

/**
 * Calculate ratio of user stats & elements between one user effect to another
 * Returns a ratio between 0 to 1, 0 indicating e.g. that none of the stats in LHS are
 * matched in the RHS, whereas a ratio of 1 means everything is matched by a value in RHS
 */
const getEfficiencyRatio = (lhs: UserEffect, rhs: UserEffect) => {
  let attacks = 0;
  let defended = 0;
  // Calculate how much damage to adjust based on stats.
  if ("statTypes" in lhs) {
    lhs.statTypes?.forEach((stat) => {
      attacks += 1;
      if ("statTypes" in rhs && rhs.statTypes?.includes(stat)) {
        defended += 1;
      }
    });
  }
  if ("generalTypes" in lhs) {
    lhs.generalTypes?.forEach((stat) => {
      attacks += 1;
      if ("generalTypes" in rhs && rhs.generalTypes?.includes(stat)) {
        defended += 1;
      }
    });
  }
  if ("elements" in lhs) {
    lhs.elements?.forEach((stat) => {
      attacks += 1;
      if ("elements" in rhs && rhs.elements?.includes(stat)) {
        defended += 1;
      }
    });
  }
  return defended / attacks;
};

/**
 * Checks for a given prevent action, e.g. stunprevent, fleeprevent, etc.
 */
const preventCheck = (
  usersEffects: UserEffect[],
  type: string,
  target: BattleUserState
) => {
  const prevent = usersEffects.find(
    (e) => e.type == type && e.targetId === target.userId
  );
  if (prevent) {
    const power = prevent.power + prevent.level * prevent.powerPerLevel;
    return Math.random() > power / 100;
  }
  return true;
};
