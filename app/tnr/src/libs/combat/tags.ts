import type { ReturnedUserState } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, BattleEffect } from "./types";
import { AnimationNames, VisualTag } from "./types";
import { damangeCalc } from "./calcs";
import { findUser, findBarrier } from "./util";
import { shouldApplyEffectTimes, isEffectStillActive, sortEffects } from "./util";
import { secondsFromNow } from "../../utils/time";
import { createId } from "@paralleldrive/cuid2";
import { COMBAT_SECONDS } from "./constants";

/**
 * Realize tag with information about how powerful tag is
 */
export const realizeTag = <T extends BattleEffect>(
  tag: T,
  user: ReturnedUserState
): T => {
  if ("statTypes" in tag && tag.statTypes) {
    if (tag.direction === "offensive") {
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
    } else {
      if (tag.statTypes.includes("Ninjutsu")) {
        tag.ninjutsu_defence = user.ninjutsu_defence;
      }
      if (tag.statTypes.includes("Genjutsu")) {
        tag.genjutsu_defence = user.genjutsu_defence;
      }
      if (tag.statTypes.includes("Taijutsu")) {
        tag.taijutsu_defence = user.taijutsu_defence;
      }
      if (tag.statTypes.includes("Bukijutsu")) {
        tag.bukijutsu_defence = user.bukijutsu_defence;
      }
      if (tag.statTypes.includes("Highest")) {
        tag.highest_defence = user.highest_defence;
      }
    }
  }
  if ("generalTypes" in tag) {
    tag.strength = user.strength;
    tag.intelligence = user.intelligence;
    tag.willpower = user.willpower;
    tag.speed = user.speed;
  }
  if (tag.rounds) {
    tag.createdAt = Date.now();
    tag.timeTracker = {};
  }
  if ("power" in tag) {
    tag.power = tag.power;
  }
  tag.id = createId();
  tag.creatorId = user.userId;
  tag.targetType = "user";
  return tag;
};

export const applyEffects = (
  usersState: ReturnedUserState[],
  usersEffects: UserEffect[],
  groundEffects: GroundEffect[]
) => {
  // Active effects to be applied to users state
  const active = [...usersEffects];

  // Things we wish to return
  const newGroundEffects: GroundEffect[] = [];
  const newUsersEffects: UserEffect[] = [];
  const actionEffects: ActionEffect[] = [];

  /**
   * Add a visual effect to be displayed
   */
  const addVisualEffect = (info: {
    creatorId: string;
    longitude: number;
    latitude: number;
    staticAssetPath?: string;
    appearAnimation?: (typeof AnimationNames)[number];
    staticAnimation?: (typeof AnimationNames)[number];
    id?: string;
    rounds?: number;
  }) => {
    const effect = {
      ...info,
      ...VisualTag.parse({
        ...info,
        type: "visual",
        rounds: info.rounds ?? 1,
        description: "N/A",
        createdAt: Date.now(),
      }),
      id: info.id ?? createId(),
    };
    newGroundEffects.push(effect);
  };

  // Convert all ground effects to user effects on the users standing on the tile
  groundEffects.sort(sortEffects).forEach((e) => {
    if (e.type === "move") {
      // 1. Remove user from current ground effect
      // 2. Add user to any new ground effect
      // 3. Move user
      const user = usersState.find((u) => u.userId === e.creatorId);
      if (user) {
        groundEffects.forEach((g) => {
          if (g.timeTracker && user.userId in g.timeTracker) {
            delete g.timeTracker[user.userId];
          }
        });
        groundEffects.forEach((g) => {
          if (
            g.timeTracker &&
            g.longitude === e.longitude &&
            g.latitude === e.latitude
          ) {
            g.timeTracker[user.userId] = Date.now();
          }
        });
        user.longitude = e.longitude;
        user.latitude = e.latitude;
      }
    } else if (e.type === "clone") {
      // TODO: set stats to percentage of original
      const user = usersState.find((u) => u.userId === e.creatorId);
      if (user) {
        usersState.push({
          ...user,
          userId: createId(),
          longitude: e.longitude,
          latitude: e.latitude,
          is_original: false,
        });
      }
      if (e.appearAnimation) {
        addVisualEffect(e);
      }
    } else {
      // Apply ground effect to user
      const user = findUser(usersState, e.longitude, e.latitude);
      if (user) {
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
        newGroundEffects.push(e);
      } else {
        if (e.disappearAnimation) {
          addVisualEffect({
            creatorId: e.creatorId,
            appearAnimation: e.disappearAnimation,
            longitude: e.longitude,
            latitude: e.latitude,
          });
        }
      }
    }
  });

  // Apply all user effects to their target users
  active.sort(sortEffects).forEach((e) => {
    // Get the user && effect details
    const target = usersState.find((u) => u.userId === e.targetId);
    const priorHealth = target?.cur_health;
    let longitude = target?.longitude;
    let latitude = target?.latitude;
    // Special cases
    if (!target && e.type === "damage" && e.targetType === "barrier") {
      const idx = newGroundEffects.findIndex((g) => g.id === e.targetId);
      const barrier = newGroundEffects[idx];
      if (barrier && barrier.power && e.power) {
        const applyTimes = shouldApplyEffectTimes(e, barrier.id);
        if (applyTimes > 0) {
          longitude = barrier.longitude;
          latitude = barrier.latitude;
          barrier.power -= e.power * applyTimes;
          actionEffects.push({
            txt: `Barrier takes ${e.power} damage ${
              barrier.power <= 0
                ? "and is destroyed."
                : `and has ${barrier.power} power left.`
            }`,
            color: "red",
          });
          if (barrier.power <= 0) {
            newGroundEffects.splice(idx, 1);
          }
        }
      }
    }
    // Process the different tags
    if (target) {
      const applyTimes = shouldApplyEffectTimes(e, target.userId);
      if (applyTimes > 0) {
        if (e.type === "damage") {
          const damage = damangeCalc(e, target) * applyTimes;
          target.cur_health -= damage;
          target.cur_health = Math.max(0, target.cur_health);
          actionEffects.push({
            txt: `${target.username} takes ${damage} damage`,
            color: "red",
          });
        } else if (e.type === "flee") {
          // TODO: Flee from battle
        }
      }
    }
    // Show once appearing animation
    if (e.appearAnimation && longitude && latitude) {
      addVisualEffect({
        creatorId: e.creatorId,
        appearAnimation: e.appearAnimation,
        longitude,
        latitude,
      });
    }
    // Process disappear animation of characters
    if (
      target &&
      target.cur_health <= 0 &&
      target.cur_health !== priorHealth &&
      !target.is_original &&
      longitude &&
      latitude
    ) {
      addVisualEffect({
        creatorId: e.creatorId,
        appearAnimation: "smoke",
        longitude,
        latitude,
      });
    }
    // Process round reduction & tag removal
    if (isEffectStillActive(e) && !e.fromGround) {
      newUsersEffects.push(e);
    } else {
      if (e.disappearAnimation && longitude && latitude) {
        addVisualEffect({
          creatorId: e.creatorId,
          appearAnimation: e.disappearAnimation,
          longitude,
          latitude,
        });
      }
    }
  });

  return {
    newUsersState: usersState,
    newUsersEffects,
    newGroundEffects,
    actionEffects,
  };
};
