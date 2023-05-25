import type { BattleUserState, Consequence } from "./types";
import type { GroundEffect, UserEffect, ActionEffect } from "./types";
import { shouldApplyEffectTimes } from "./util";
import { createId } from "@paralleldrive/cuid2";

/** Absorb damage & convert it to healing */
export const absorb = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState
) => {
  const { power, qualifier } = getPower(effect);
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
        consequence.absorb = convert;
      }
    }
  });
  return getInfo(target, effect, `will absorb ${qualifier} damage`);
};

/** Adjust armor by a static amount */
export const adjustArmor = (effect: UserEffect, target: BattleUserState) => {
  const { power, adverb, qualifier } = getPower(effect);
  target.armor += power;
  return getInfo(target, effect, `armor is ${adverb} by ${qualifier}`);
};

/** Adjust stats of target based on effect */
export const adjustStats = (effect: UserEffect, target: BattleUserState) => {
  const { power, adverb, qualifier } = getPower(effect);
  const affected: string[] = [];
  if ("calculation" in effect && "statTypes" in effect) {
    effect.statTypes?.forEach((stat) => {
      if (stat === "Highest") {
        if (effect.calculation === "static") {
          target.highest_offence += power;
          target.highest_defence += power;
        } else if (effect.calculation === "percentage") {
          target.highest_offence *= (100 + power) / 100;
          target.highest_defence *= (100 + power) / 100;
        }
      } else if (stat === "Ninjutsu") {
        if (effect.calculation === "static") {
          target.ninjutsu_offence += power;
          target.ninjutsu_defence += power;
        } else if (effect.calculation === "percentage") {
          target.ninjutsu_offence *= (100 + power) / 100;
          target.ninjutsu_defence *= (100 + power) / 100;
        }
      } else if (stat === "Genjutsu") {
        if (effect.calculation === "static") {
          target.genjutsu_offence += power;
          target.genjutsu_defence += power;
        } else if (effect.calculation === "percentage") {
          target.genjutsu_offence *= (100 + power) / 100;
          target.genjutsu_defence *= (100 + power) / 100;
        }
      } else if (stat === "Taijutsu") {
        if (effect.calculation === "static") {
          target.taijutsu_offence += power;
          target.taijutsu_defence += power;
        } else if (effect.calculation === "percentage") {
          target.taijutsu_offence *= (100 + power) / 100;
          target.taijutsu_defence *= (100 + power) / 100;
        }
      } else if (stat === "Bukijutsu") {
        if (effect.calculation === "static") {
          target.bukijutsu_offence += power;
          target.bukijutsu_defence += power;
        } else if (effect.calculation === "percentage") {
          target.bukijutsu_offence *= (100 + power) / 100;
          target.bukijutsu_defence *= (100 + power) / 100;
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
  return getInfo(target, effect, `healing capacity is ${adverb} by ${qualifier}`);
};

/** Clone user on the battlefield */
export const clone = (usersState: BattleUserState[], effect: GroundEffect) => {
  const user = usersState.find((u) => u.userId === effect.creatorId);
  if (user && effect.power) {
    const perc = effect.power / 100;
    user.max_health = user.max_health * perc;
    user.max_chakra = user.max_chakra * perc;
    user.max_stamina = user.max_stamina * perc;
    user.cur_health = user.cur_health * perc;
    user.cur_chakra = user.cur_chakra * perc;
    user.cur_stamina = user.cur_stamina * perc;
    user.ninjutsu_offence = user.ninjutsu_offence * perc;
    user.ninjutsu_defence = user.ninjutsu_defence * perc;
    user.genjutsu_offence = user.genjutsu_offence * perc;
    user.genjutsu_defence = user.genjutsu_defence * perc;
    user.taijutsu_offence = user.taijutsu_offence * perc;
    user.taijutsu_defence = user.taijutsu_defence * perc;
    user.bukijutsu_offence = user.bukijutsu_offence * perc;
    user.bukijutsu_defence = user.bukijutsu_defence * perc;
    user.highest_offence = user.highest_offence * perc;
    user.highest_defence = user.highest_defence * perc;
    user.strength = user.strength * perc;
    user.intelligence = user.intelligence * perc;
    user.willpower = user.willpower * perc;
    user.speed = user.speed * perc;
    usersState.push({
      ...user,
      userId: createId(),
      longitude: effect.longitude,
      latitude: effect.latitude,
      is_original: false,
    });
    return true;
  }
  return false;
};

/** Calculate damage effect on target */
export const damage = (
  effect: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState,
  consequences: Map<string, Consequence>,
  applyTimes: number
) => {
  let { power } = getPower(effect);
  if ("calculation" in effect && effect.calculation === "formula") {
    const dir = "offensive";
    effect.statTypes?.forEach((statType) => {
      const lower = statType.toLowerCase();
      const a = `${lower}_${dir ? "offence" : "defence"}`;
      const b = `${lower}_${dir ? "defence" : "offence"}`;
      if (effect.fromGround && a in effect && b in target) {
        const left = effect[a as keyof typeof effect] as number;
        const right = target[b as keyof typeof target] as number;
        power *= left / right;
      } else if (origin && a in origin && b in target) {
        const left = origin[a as keyof typeof origin] as number;
        const right = target[b as keyof typeof target] as number;
        power *= left / right;
      }
    });
    effect.generalTypes?.forEach((generalType) => {
      const lower = generalType.toLowerCase();
      if (effect.fromGround && lower in effect && lower in target) {
        const left = effect[lower as keyof typeof effect] as number;
        const right = target[lower as keyof typeof target] as number;
        power *= left / right;
      } else if (origin && lower in origin && lower in target) {
        const left = origin[lower as keyof typeof origin] as number;
        const right = target[lower as keyof typeof target] as number;
        power *= left / right;
      }
    });
  }
  consequences.set(effect.id, {
    userId: effect.creatorId,
    targetId: effect.targetId,
    damage: Math.floor(20 * power) * applyTimes,
  });
  return getInfo(target, effect, "will take damage");
};

/** Apply damage effect to barrier */
export const damageBarrier = (groundEffects: GroundEffect[], effect: UserEffect) => {
  const idx = groundEffects.findIndex((g) => g.id === effect.targetId);
  const barrier = groundEffects[idx];
  if (barrier && barrier.power && effect.power) {
    const applyTimes = shouldApplyEffectTimes(effect, barrier.id);
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
      ? target.max_health * (power / 100) * applyTimes
      : power * applyTimes;
  consequences.set(effect.id, {
    userId: effect.creatorId,
    targetId: effect.targetId,
    heal,
  });
  return getInfo(target, effect, "will heal");
};

/** Reflect damage back to the opponent */
export const reflect = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>,
  target: BattleUserState
) => {
  const { power } = getPower(effect);
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
  return getInfo(target, effect, "will reflect damage");
};

/**
 * Move user on the battlefield
 * 1. Remove user from current ground effect
 * 2. Add user to any new ground effect
 * 3. Move user
 */
export const move = (
  usersState: BattleUserState[],
  groundEffects: GroundEffect[],
  effect: GroundEffect
) => {
  const user = usersState.find((u) => u.userId === effect.creatorId);
  if (user) {
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
    user.longitude = effect.longitude;
    user.latitude = effect.latitude;
  }
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
    target.cur_health = 0;
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
const getPower = (effect: UserEffect) => {
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
