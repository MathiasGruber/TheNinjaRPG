import type { ReturnedUserState } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, BattleEffect } from "./types";
import { VisualTag, AnimationNames } from "./types";
import { damangeCalc } from "./calcs";
import { createId } from "@paralleldrive/cuid2";

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
    newGroundEffects.push({
      ...info,
      rounds: info.rounds ?? 0,
      id: info.id ?? createId(),
      description: "N/A",
      timing: "immidiately",
      type: "visual",
    });
  };

  // Convert all ground effects to user effects on the users standing on the tile
  groundEffects
    .filter((e) => !("rounds" in e) || (e.rounds && e.rounds > 0))
    .forEach((e) => {
      if (e.type === "move") {
        const user = usersState.find((u) => u.userId === e.creatorId);
        if (user) user.longitude = e.longitude;
        if (user) user.latitude = e.latitude;
      } else if (e.type === "clone") {
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
          addVisualEffect({
            creatorId: e.creatorId,
            appearAnimation: e.appearAnimation,
            longitude: e.longitude,
            latitude: e.latitude,
          });
        }
        // TODO: set stats to percentage of original
      } else {
        // Apply ground effect to user
        const user = usersState.find(
          (u) => u.longitude === e.longitude && u.latitude === e.latitude
        );
        if (user) {
          active.push({ ...e, targetId: user.userId } as UserEffect);
        }
        // Let ground effect continue, or is it done?
        if ("rounds" in e && e.rounds) {
          if (e.rounds > 1) {
            newGroundEffects.push({ ...e, rounds: e.rounds - 1 });
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
        } else {
          newGroundEffects.push(e);
        }
      }
    });

  // Apply all user effects to their target users
  active
    .filter((e) => !("rounds" in e) || (e.rounds && e.rounds > 0))
    .forEach((e) => {
      // Get the user
      const target = usersState.find((u) => u.userId === e.targetId);
      const priorHealth = target?.cur_health;
      let longitude = target?.longitude;
      let latitude = target?.latitude;
      // Process the different tags
      if (e.type === "damage") {
        if (e.targetType === "barrier") {
          // Deal damage to a barrier
          const idx = newGroundEffects.findIndex((g) => g.id === e.targetId);
          const barrier = newGroundEffects[idx];
          if (barrier && barrier.power && e.power) {
            longitude = barrier.longitude;
            latitude = barrier.latitude;
            barrier.power -= e.power;
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
        } else {
          // Deal damage to a user
          if (target) {
            const damage = damangeCalc(e, target);
            target.cur_health -= damage * 10;
            target.cur_health = Math.max(0, target.cur_health);
            actionEffects.push({
              txt: `${target.username} takes ${damage} damage`,
              color: "red",
            });
          }
        }
      } else if (e.type === "flee") {
        // TODO: Flee from battle
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
      if ("rounds" in e && e.rounds) {
        if (e.rounds > 1) {
          newUsersEffects.push({ ...e, rounds: e.rounds - 1 });
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
      } else {
        newUsersEffects.push(e);
      }
    });

  return {
    newUsersState: usersState,
    newUsersEffects,
    newGroundEffects,
    actionEffects,
  };
};
