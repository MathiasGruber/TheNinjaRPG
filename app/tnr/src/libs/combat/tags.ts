import type { BattleUserState, AnimationNames } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, BattleEffect } from "./types";
import { VisualTag } from "./types";
import { damangeCalc } from "./calcs";
import { findUser, findBarrier } from "./util";
import { shouldApplyEffectTimes, isEffectStillActive, sortEffects } from "./util";
import { createId } from "@paralleldrive/cuid2";
import { off } from "process";

/**
 * Realize tag with information about how powerful tag is
 */
export const realizeTag = <T extends BattleEffect>(
  tag: T,
  user: BattleUserState,
  isGround = false
): T => {
  if (isGround && "statTypes" in tag && tag.statTypes) {
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
  return tag;
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
        rounds: info.rounds ?? 0,
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
      const user = newUsersState.find((u) => u.userId === e.creatorId);
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
      const user = newUsersState.find((u) => u.userId === e.creatorId);
      if (user && e.power) {
        const perc = e.power / 100;
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
        newUsersState.push({
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
    const origin = usersState.find((u) => u.userId === e.creatorId);
    const targetCur = usersState.find((u) => u.userId === e.targetId);
    const targetNew = newUsersState.find((u) => u.userId === e.targetId);
    const priorHealth = targetNew?.cur_health;
    let longitude = targetNew?.longitude;
    let latitude = targetNew?.latitude;
    // Special cases
    if (e.type === "damage" && e.targetType === "barrier") {
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
    if (targetCur && targetNew) {
      const applyTimes = shouldApplyEffectTimes(e, targetCur.userId);
      if (applyTimes > 0) {
        if (e.type === "damage") {
          // TODO: Account for level power effect
          const damage = damangeCalc(e, origin, targetCur) * applyTimes;
          targetNew.cur_health -= damage;
          targetNew.cur_health = Math.max(0, targetNew.cur_health);
          actionEffects.push({
            txt: `${targetCur.username} takes ${damage} damage`,
            color: "red",
          });
        } else if (e.type === "armoradjust") {
          if (e.power) {
            // TODO: Account for level power effect
            const power = e.power;
            targetCur.armor += power;
          }
        } else if (e.type === "statadjust") {
          if (e.power && "calculation" in e && "statTypes" in e) {
            const power = e.power;
            e.statTypes?.forEach((stat) => {
              if (stat === "Highest") {
                if (e.calculation === "static") {
                  targetCur.highest_offence += power;
                  targetCur.highest_defence += power;
                } else if (e.calculation === "percentage") {
                  targetCur.highest_offence *= (100 + power) / 100;
                  targetCur.highest_defence *= (100 + power) / 100;
                }
              } else if (stat === "Ninjutsu") {
                if (e.calculation === "static") {
                  targetCur.ninjutsu_offence += power;
                  targetCur.ninjutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  targetCur.ninjutsu_offence *= (100 + power) / 100;
                  targetCur.ninjutsu_defence *= (100 + power) / 100;
                }
              } else if (stat === "Genjutsu") {
                if (e.calculation === "static") {
                  targetCur.genjutsu_offence += power;
                  targetCur.genjutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  targetCur.genjutsu_offence *= (100 + power) / 100;
                  targetCur.genjutsu_defence *= (100 + power) / 100;
                }
              } else if (stat === "Taijutsu") {
                if (e.calculation === "static") {
                  targetCur.taijutsu_offence += power;
                  targetCur.taijutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  targetCur.taijutsu_offence *= (100 + power) / 100;
                  targetCur.taijutsu_defence *= (100 + power) / 100;
                }
              } else if (stat === "Bukijutsu") {
                if (e.calculation === "static") {
                  targetCur.bukijutsu_offence += power;
                  targetCur.bukijutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  targetCur.bukijutsu_offence *= (100 + power) / 100;
                  targetCur.bukijutsu_defence *= (100 + power) / 100;
                }
              }
            });
            e.generalTypes?.forEach((general) => {
              if (general === "Strength") {
                if (e.calculation === "static") {
                  targetCur.strength += power;
                } else if (e.calculation === "percentage") {
                  targetCur.strength *= (100 + power) / 100;
                }
              } else if (general === "Intelligence") {
                if (e.calculation === "static") {
                  targetCur.intelligence += power;
                } else if (e.calculation === "percentage") {
                  targetCur.intelligence *= (100 + power) / 100;
                }
              } else if (general === "Willpower") {
                if (e.calculation === "static") {
                  targetCur.willpower += power;
                } else if (e.calculation === "percentage") {
                  targetCur.willpower *= (100 + power) / 100;
                }
              } else if (general === "Speed") {
                if (e.calculation === "static") {
                  targetCur.speed += power;
                } else if (e.calculation === "percentage") {
                  targetCur.speed *= (100 + power) / 100;
                }
              }
            });
          }
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
      targetNew &&
      targetNew.cur_health <= 0 &&
      targetNew.cur_health !== priorHealth &&
      !targetNew.is_original &&
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
    newUsersState,
    newUsersEffects,
    newGroundEffects,
    actionEffects,
  };
};
