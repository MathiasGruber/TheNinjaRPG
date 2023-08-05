import { VisualTag } from "./types";
import { findUser, findBarrier } from "./util";
import { collapseConsequences, sortEffects } from "./util";
import { shouldApplyEffectTimes, isEffectStillActive } from "./util";
import { nanoid } from "nanoid";
import { clone, move, heal, damageBarrier, damage, absorb, reflect } from "./tags";
import { adjustStats, adjustDamageGiven, adjustDamageTaken } from "./tags";
import { adjustHealGiven, adjustArmor, flee, fleePrevent } from "./tags";
import { stun, stunPrevent, onehitkill, onehitkillPrevent } from "./tags";
import { seal, sealPrevent, sealCheck, pooladjust, rob, robPrevent } from "./tags";
import { updateStatUsage } from "./tags";
import { clear } from "./tags";
import type { BattleUserState } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, BattleEffect } from "./types";
import type { AnimationNames } from "./types";
import type { CompleteBattle, Consequence } from "./types";

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
      tag.ninjutsuOffence = user.ninjutsuOffence;
    }
    if (tag.statTypes.includes("Genjutsu")) {
      tag.genjutsuOffence = user.genjutsuOffence;
    }
    if (tag.statTypes.includes("Taijutsu")) {
      tag.taijutsuOffence = user.taijutsuOffence;
    }
    if (tag.statTypes.includes("Bukijutsu")) {
      tag.bukijutsuOffence = user.bukijutsuOffence;
    }
    if (tag.statTypes.includes("Highest")) {
      tag.highestOffence = user.highestOffence;
    }
  }
  if (isGround && "generalTypes" in tag) {
    tag.strength = user.strength;
    tag.intelligence = user.intelligence;
    tag.willpower = user.willpower;
    tag.speed = user.speed;
  }
  if ("rounds" in tag) {
    tag.timeTracker = {};
  }
  if ("power" in tag) {
    tag.power = tag.power;
  }
  tag.id = nanoid();
  tag.createdAt = Date.now();
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
  animation?: keyof typeof AnimationNames
): GroundEffect => {
  return {
    ...VisualTag.parse({
      type: "visual",
      rounds: 0,
      description: "N/A",
      appearAnimation: animation,
      createdAt: Date.now(),
    }),
    id: nanoid(),
    createdAt: Date.now(),
    creatorId: nanoid(),
    level: 0,
    isNew: true,
    longitude,
    latitude,
  };
};

export const applyEffects = (battle: CompleteBattle) => {
  // Destructure
  const { usersState, usersEffects, groundEffects } = battle;
  // Things we wish to return
  const newUsersState = structuredClone(usersState);
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
        usersEffects.push({
          ...e,
          targetId: user.userId,
          fromGround: true,
        } as UserEffect);
      }
      // Forward any damage effects, which should be applied to barriers as well
      if (!user && e.type === "damage") {
        const barrier = findBarrier(groundEffects, e.longitude, e.latitude);
        if (barrier) {
          usersEffects.push({
            ...e,
            targetType: "barrier",
            targetId: barrier.id,
            fromGround: true,
          } as UserEffect);
        }
      }
      // Let ground effect continue, or is it done?
      if (isEffectStillActive(e, battle)) {
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
  const sealEffects = usersEffects.filter(
    (e) => e.type === "seal" && !e.isNew && isEffectStillActive(e, battle)
  );

  // Apply all user effects to their target users
  usersEffects.sort(sortEffects).forEach((e) => {
    // Get the user && effect details
    const newUser = newUsersState.find((u) => u.userId === e.creatorId);
    let longitude: number | undefined = undefined;
    let latitude: number | undefined = undefined;
    let info: ActionEffect | undefined = undefined;
    // Special cases
    if (e.type === "damage" && e.targetType === "barrier") {
      const result = damageBarrier(battle, e);
      if (result) {
        longitude = result.barrier.longitude;
        latitude = result.barrier.latitude;
        actionEffects.push(result.info);
      }
    } else if (e.targetType === "user") {
      const curTarget = usersState.find((u) => u.userId === e.targetId);
      const newTarget = newUsersState.find((u) => u.userId === e.targetId);
      const applyTimes = shouldApplyEffectTimes(e, battle, e.targetId);
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
          info = damage(e, newUser, curTarget, consequences, applyTimes);
          updateStatUsage(newTarget, e, true);
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
          info = clear(e, usersEffects, curTarget);
        } else if (e.type === "onehitkill") {
          info = onehitkill(e, newUsersEffects, newTarget);
          updateStatUsage(newTarget, e, true);
        } else if (e.type === "onehitkillprevent") {
          info = onehitkillPrevent(e, curTarget);
        } else if (e.type === "robprevent") {
          info = robPrevent(e, curTarget);
        } else if (e.type === "rob") {
          info = rob(e, newUsersEffects, newUser, newTarget);
          updateStatUsage(newTarget, e, true);
        } else if (e.type === "sealprevent") {
          info = sealPrevent(e, curTarget);
        } else if (e.type === "seal") {
          info = seal(e, newUsersEffects, curTarget);
        } else if (e.type === "stunprevent") {
          info = stunPrevent(e, curTarget);
        } else if (e.type === "stun") {
          info = stun(e, newUsersEffects, curTarget);
          updateStatUsage(newTarget, e, true);
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
    if (isEffectStillActive(e, battle) && !e.fromGround) {
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
          target.curHealth -= c.damage;
          target.curHealth = Math.max(0, target.curHealth);
          actionEffects.push({
            txt: `${target.username} takes ${c.damage.toFixed(2)} damage`,
            color: "red",
          });
        }
        if (c.heal && c.heal > 0) {
          target.curHealth += c.heal;
          target.curHealth = Math.min(target.maxHealth, target.curHealth);
          actionEffects.push({
            txt: `${target.username} heals ${c.heal} HP`,
            color: "green",
          });
        }
        if (c.reflect && c.reflect > 0) {
          user.curHealth -= c.reflect;
          user.curHealth = Math.max(0, user.curHealth);
          actionEffects.push({
            txt: `${user.username} takes ${c.reflect.toFixed(2)} reflect damage`,
            color: "red",
          });
        }
        if (c.absorb && c.absorb > 0) {
          user.curHealth += c.absorb;
          user.curHealth = Math.min(user.maxHealth, user.curHealth);
          actionEffects.push({
            txt: `${user.username} absorbs ${c.absorb.toFixed(
              2
            )} damage and restores HP`,
            color: "green",
          });
        }
        // Process disappear animation of characters
        if (target.curHealth <= 0 && !target.isOriginal) {
          newGroundEffects.push(getVisual(target.longitude, target.latitude, "smoke"));
        }
        if (user.curHealth <= 0 && !user.isOriginal) {
          newGroundEffects.push(getVisual(user.longitude, user.latitude, "smoke"));
        }
      }
    });

  return {
    newBattle: {
      ...battle,
      usersState: newUsersState,
      usersEffects: newUsersEffects,
      groundEffects: newGroundEffects,
    },
    actionEffects,
  };
};
