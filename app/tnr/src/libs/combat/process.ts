import type { BattleUserState, AnimationNames } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, BattleEffect } from "./types";
import { VisualTag, type Consequence } from "./types";
import { findUser, findBarrier } from "./util";
import { collapseConsequences, sortEffects } from "./util";
import { shouldApplyEffectTimes, isEffectStillActive } from "./util";
import { createId } from "@paralleldrive/cuid2";
import { clone, move, heal, damageBarrier, damage, absorb, reflect } from "./tags";
import { adjustStats, adjustDamageGiven, adjustDamageTaken } from "./tags";
import { adjustHealGiven, adjustArmor, flee, fleePrevent } from "./tags";
import { stun, stunPrevent, onehitkill, onehitkillPrevent } from "./tags";
import { seal, sealPrevent, sealCheck, pooladjust, rob, robPrevent } from "./tags";

/**
 * Realize tag with information about how powerful tag is
 */
export const realizeTag = <T extends BattleEffect>(
  tag: T,
  user: BattleUserState,
  level: number | undefined,
  isGround = false
): T => {
  if (isGround && "statTypes" in tag && tag.statTypes) {
    if (tag.statTypes.includes("Ninjutsu")) {
      tag.ninjutsu_offence = user.ninjutsu_offence;
    }
    if (tag.statTypes.includes("Genjutsu")) {
      tag.genjutsu_offence = user.genjutsu_offence;
    }
    if (tag.statTypes.includes("Taijutsu")) {
      tag.taijutsu_offence = user.taijutsu_offence;
    }
    if (tag.statTypes.includes("Bukijutsu")) {
      tag.bukijutsu_offence = user.bukijutsu_offence;
    }
    if (tag.statTypes.includes("Highest")) {
      tag.highest_offence = user.highest_offence;
    }
  }
  if (isGround && "generalTypes" in tag) {
    tag.strength = user.strength;
    tag.intelligence = user.intelligence;
    tag.willpower = user.willpower;
    tag.speed = user.speed;
  }
  if ("rounds" in tag) {
    tag.createdAt = Date.now();
    tag.timeTracker = {};
  }
  if ("power" in tag) {
    tag.power = tag.power;
  }
  tag.id = createId();
  tag.creatorId = user.userId;
  tag.targetType = "user";
  tag.level = level ?? 0;
  tag.isNew = true;
  return tag;
};

/**
 * Create a visual effect with a specified appearAnimation
 */
const getVisual = (
  longitude: number,
  latitude: number,
  animation?: (typeof AnimationNames)[number]
): GroundEffect => {
  return {
    ...VisualTag.parse({
      type: "visual",
      rounds: 0,
      description: "N/A",
      appearAnimation: animation,
      createdAt: Date.now(),
    }),
    id: createId(),
    createdAt: Date.now(),
    creatorId: createId(),
    level: 0,
    isNew: true,
    longitude,
    latitude,
  };
};

export const applyEffects = (
  usersState: BattleUserState[],
  usersEffects: UserEffect[],
  groundEffects: GroundEffect[]
) => {
  // Active effects to be applied to users state
  const active = [...usersEffects];

  // Things we wish to return
  const newUsersState: BattleUserState[] = usersState.map((s) => {
    return { ...s };
  });
  const newGroundEffects: GroundEffect[] = [];
  const newUsersEffects: UserEffect[] = [];
  const actionEffects: ActionEffect[] = [];

  // Convert all ground effects to user effects on the users standing on the tile
  groundEffects.sort(sortEffects).forEach((e) => {
    if (e.type === "move") {
      move(newUsersState, newGroundEffects, e);
    } else if (e.type === "clone") {
      if (clone(newUsersState, e) && e.appearAnimation) {
        newGroundEffects.push(getVisual(e.longitude, e.latitude, e.appearAnimation));
      }
    } else {
      // Apply ground effect to user
      const user = findUser(newUsersState, e.longitude, e.latitude);
      if (user && e.type !== "visual") {
        active.push({ ...e, targetId: user.userId, fromGround: true } as UserEffect);
      }
      // Forward any datmage effects, which should be applied to barriers as well
      if (!user && e.type === "damage") {
        const barrier = findBarrier(groundEffects, e.longitude, e.latitude);
        if (barrier) {
          active.push({
            ...e,
            targetType: "barrier",
            targetId: barrier.id,
            fromGround: true,
          } as UserEffect);
        }
      }
      // Let ground effect continue, or is it done?
      if (isEffectStillActive(e)) {
        e.isNew = false;
        newGroundEffects.push(e);
      } else if (e.disappearAnimation) {
        newGroundEffects.push(getVisual(e.longitude, e.latitude, e.disappearAnimation));
      }
    }
  });

  // Book-keeping for damage and heal effects
  const consequences = new Map<string, Consequence>();

  // Fetch any active sealing effects
  const sealEffects = active.filter(
    (e) => e.type === "seal" && !e.isNew && isEffectStillActive(e)
  );

  // Apply all user effects to their target users
  active.sort(sortEffects).forEach((e) => {
    // Get the user && effect details
    const newOrigin = newUsersState.find((u) => u.userId === e.creatorId);
    let longitude: number | undefined = undefined;
    let latitude: number | undefined = undefined;
    let info: ActionEffect | undefined = undefined;
    // Special cases
    if (e.type === "damage" && e.targetType === "barrier") {
      const result = damageBarrier(newGroundEffects, e);
      if (result) {
        longitude = result.barrier.longitude;
        latitude = result.barrier.latitude;
        actionEffects.push(result.info);
      }
    } else if (e.targetType === "user") {
      const curTarget = usersState.find((u) => u.userId === e.targetId);
      const newTarget = newUsersState.find((u) => u.userId === e.targetId);
      const applyTimes = shouldApplyEffectTimes(e, e.targetId);
      const isSealed = sealCheck(e, sealEffects);
      if (curTarget && newTarget && applyTimes > 0 && !isSealed) {
        longitude = curTarget?.longitude;
        latitude = curTarget?.latitude;
        if (e.type === "absorb") {
          info = absorb(e, usersEffects, consequences, curTarget);
        } else if (e.type === "armoradjust") {
          info = adjustArmor(e, curTarget);
        } else if (e.type === "statadjust") {
          info = adjustStats(e, curTarget);
        } else if (e.type === "damagegivenadjust") {
          info = adjustDamageGiven(e, usersEffects, consequences, curTarget);
        } else if (e.type === "damagetakenadjust") {
          info = adjustDamageTaken(e, usersEffects, consequences, curTarget);
        } else if (e.type === "healadjust") {
          info = adjustHealGiven(e, usersEffects, consequences, curTarget);
        } else if (e.type === "damage") {
          info = damage(e, newOrigin, curTarget, consequences, applyTimes);
        } else if (e.type === "heal") {
          info = heal(e, curTarget, consequences, applyTimes);
        } else if (e.type === "reflect") {
          info = reflect(e, usersEffects, consequences, curTarget);
        } else if (e.type === "fleeprevent") {
          info = fleePrevent(e, curTarget);
        } else if (e.type === "flee") {
          info = flee(e, newUsersEffects, newTarget);
        } else if (e.type === "poolcostadjust") {
          info = pooladjust(e, curTarget);
        } else if (e.type === "clear") {
          // TODO:
        } else if (e.type === "onehitkill") {
          info = onehitkill(e, newUsersEffects, newTarget);
        } else if (e.type === "onehitkillprevent") {
          info = onehitkillPrevent(e, curTarget);
        } else if (e.type === "robprevent") {
          info = robPrevent(e, curTarget);
        } else if (e.type === "rob") {
          info = rob(e, newUsersEffects, newOrigin, newTarget);
        } else if (e.type === "sealprevent") {
          info = sealPrevent(e, curTarget);
        } else if (e.type === "seal") {
          info = seal(e, newUsersEffects, curTarget);
        } else if (e.type === "stunprevent") {
          info = stunPrevent(e, curTarget);
        } else if (e.type === "stun") {
          info = stun(e, newUsersEffects, curTarget);
        } else if (e.type === "summonprevent") {
          // TODO:
        } else if (e.type === "summon") {
          // TODO:
        }
      }
    }

    // Show text results of actions
    if (info) {
      actionEffects.push(info);
    }

    // Show once appearing animation
    if (e.appearAnimation && longitude && latitude) {
      newGroundEffects.push(getVisual(longitude, latitude, e.appearAnimation));
    }

    // Process round reduction & tag removal
    if (isEffectStillActive(e) && !e.fromGround) {
      e.isNew = false;
      newUsersEffects.push(e);
    } else if (e.disappearAnimation && longitude && latitude) {
      newGroundEffects.push(getVisual(longitude, latitude, e.disappearAnimation));
    }
  });

  // Apply consequences to users
  Array.from(consequences.values())
    .reduce(collapseConsequences, [] as Consequence[])
    .forEach((c) => {
      const user = newUsersState.find((u) => u.userId === c.userId);
      const target = newUsersState.find((u) => u.userId === c.targetId);
      if (target && user) {
        if (c.damage && c.damage > 0) {
          target.cur_health -= c.damage;
          target.cur_health = Math.max(0, target.cur_health);
          actionEffects.push({
            txt: `${target.username} takes ${c.damage} damage`,
            color: "red",
          });
        }
        if (c.heal && c.heal > 0) {
          target.cur_health += c.heal;
          target.cur_health = Math.min(target.max_health, target.cur_health);
          actionEffects.push({
            txt: `${target.username} heals ${c.heal} HP`,
            color: "green",
          });
        }
        if (c.reflect && c.reflect > 0) {
          user.cur_health -= c.reflect;
          user.cur_health = Math.max(0, user.cur_health);
          actionEffects.push({
            txt: `${user.username} takes ${c.reflect} reflect damage`,
            color: "red",
          });
        }
        if (c.absorb && c.absorb > 0) {
          user.cur_health += c.absorb;
          user.cur_health = Math.min(user.max_health, user.cur_health);
          actionEffects.push({
            txt: `${user.username} absorbs ${c.absorb} damage and restores HP`,
            color: "green",
          });
        }
        // Process disappear animation of characters
        if (target.cur_health <= 0 && !target.is_original) {
          newGroundEffects.push(getVisual(target.longitude, target.latitude, "smoke"));
        }
        if (user.cur_health <= 0 && !user.is_original) {
          newGroundEffects.push(getVisual(user.longitude, user.latitude, "smoke"));
        }
      }
    });

  return {
    newUsersState,
    newUsersEffects,
    newGroundEffects,
    actionEffects,
  };
};
