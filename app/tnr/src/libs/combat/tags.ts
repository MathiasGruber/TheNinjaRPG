import type { BattleUserState, AnimationNames } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, Consequence } from "./types";
import { shouldApplyEffectTimes } from "./util";
import { createId } from "@paralleldrive/cuid2";

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

/** Calculate damage effect on target */
export const damage = (
  effect: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState,
  consequences: Map<string, Consequence>,
  applyTimes: number
) => {
  let ratio = effect.power + effect.level * effect.powerPerLevel;
  if ("calculation" in effect && effect.calculation === "formula") {
    const dir = "offensive";
    effect.statTypes?.forEach((statType) => {
      const lower = statType.toLowerCase();
      const a = `${lower}_${dir ? "offence" : "defence"}`;
      const b = `${lower}_${dir ? "defence" : "offence"}`;
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
  }
  const damage = Math.floor(20 * ratio) * applyTimes;
  consequences.set(effect.id, {
    userId: effect.creatorId,
    targetId: effect.targetId,
    damage,
  });
  return damage;
};

/** Calculate healing effect on target */
export const heal = (
  effect: UserEffect,
  target: BattleUserState,
  consequences: Map<string, Consequence>,
  applyTimes: number
) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
  const heal =
    effect.calculation === "percentage"
      ? target.max_health * (power / 100) * applyTimes
      : power * applyTimes;
  consequences.set(effect.id, {
    userId: effect.creatorId,
    targetId: effect.targetId,
    heal,
  });
};

/** Absorb damage & convert it to healing */
export const absorb = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>
) => {
  console.log(effect);
  console.log(consequences);
  const power = effect.power + effect.level * effect.powerPerLevel;
  consequences.forEach((consequence, effectId) => {
    if (consequence.targetId === effect.targetId && consequence.damage) {
      const damageEffect = usersEffects.find((e) => e.id === effectId);
      console.log(damageEffect);
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
};

/** Reflect damage back to the opponent */
export const reflect = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>
) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
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
};

/** Adjust armor by a static amount */
export const adjustArmor = (effect: UserEffect, target: BattleUserState) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
  target.armor += power;
};

/** Adjust stats of target based on effect */
export const adjustStats = (effect: UserEffect, target: BattleUserState) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
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
  }
};

/** Adjust damage given by target */
export const adjustDamageGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>
) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
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
};

/** Adjust damage taken by user */
export const adjustDamageTaken = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>
) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
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
};

/** Adjust ability to heal other of target */
export const adjustHealGiven = (
  effect: UserEffect,
  usersEffects: UserEffect[],
  consequences: Map<string, Consequence>
) => {
  const power = effect.power + effect.level * effect.powerPerLevel;
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
