import type { BattleUserState, AnimationNames } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, BattleEffect } from "./types";
import { VisualTag, Consequence } from "./types";
import { damangeCalc } from "./calcs";
import { findUser, findBarrier } from "./util";
import { shouldApplyEffectTimes, isEffectStillActive, sortEffects } from "./util";
import { createId } from "@paralleldrive/cuid2";

/**
 * Realize tag with information about how powerful tag is
 */
export const realizeTag = <T extends BattleEffect>(
  tag: T,
  user: BattleUserState,
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

  // Book-keeping for damage and heal effects
  const consequences = new Map<string, Consequence>();

  // Apply all user effects to their target users
  active.sort(sortEffects).forEach((e) => {
    // Get the user && effect details
    const origin = usersState.find((u) => u.userId === e.creatorId);
    const target = usersState.find((u) => u.userId === e.targetId);
    let longitude = target?.longitude;
    let latitude = target?.latitude;
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
    if (target) {
      const applyTimes = shouldApplyEffectTimes(e, target.userId);
      if (applyTimes > 0) {
        if (e.type === "damage") {
          // TODO: Account for level power effect
          const damage = damangeCalc(e, origin, target) * applyTimes;
          consequences.set(e.id, { userId: e.creatorId, targetId: e.targetId, damage });
        } else if (e.type === "heal") {
          // TODO: Account for level power effect
          const power = e.power;
          const heal =
            e.calculation === "percentage" ? target.max_health * (power / 100) : power;
          consequences.set(e.id, { userId: e.creatorId, targetId: e.targetId, heal });
        } else if (e.type === "armoradjust") {
          if (e.power) {
            // TODO: Account for level power effect
            const power = e.power;
            target.armor += power;
          }
        } else if (e.type === "statadjust") {
          // TODO: Show message about stat changes on first apply?
          if (e.power && "calculation" in e && "statTypes" in e) {
            const power = e.power;
            e.statTypes?.forEach((stat) => {
              if (stat === "Highest") {
                if (e.calculation === "static") {
                  target.highest_offence += power;
                  target.highest_defence += power;
                } else if (e.calculation === "percentage") {
                  target.highest_offence *= (100 + power) / 100;
                  target.highest_defence *= (100 + power) / 100;
                }
              } else if (stat === "Ninjutsu") {
                if (e.calculation === "static") {
                  target.ninjutsu_offence += power;
                  target.ninjutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  target.ninjutsu_offence *= (100 + power) / 100;
                  target.ninjutsu_defence *= (100 + power) / 100;
                }
              } else if (stat === "Genjutsu") {
                if (e.calculation === "static") {
                  target.genjutsu_offence += power;
                  target.genjutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  target.genjutsu_offence *= (100 + power) / 100;
                  target.genjutsu_defence *= (100 + power) / 100;
                }
              } else if (stat === "Taijutsu") {
                if (e.calculation === "static") {
                  target.taijutsu_offence += power;
                  target.taijutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  target.taijutsu_offence *= (100 + power) / 100;
                  target.taijutsu_defence *= (100 + power) / 100;
                }
              } else if (stat === "Bukijutsu") {
                if (e.calculation === "static") {
                  target.bukijutsu_offence += power;
                  target.bukijutsu_defence += power;
                } else if (e.calculation === "percentage") {
                  target.bukijutsu_offence *= (100 + power) / 100;
                  target.bukijutsu_defence *= (100 + power) / 100;
                }
              }
            });
            e.generalTypes?.forEach((general) => {
              if (general === "Strength") {
                if (e.calculation === "static") {
                  target.strength += power;
                } else if (e.calculation === "percentage") {
                  target.strength *= (100 + power) / 100;
                }
              } else if (general === "Intelligence") {
                if (e.calculation === "static") {
                  target.intelligence += power;
                } else if (e.calculation === "percentage") {
                  target.intelligence *= (100 + power) / 100;
                }
              } else if (general === "Willpower") {
                if (e.calculation === "static") {
                  target.willpower += power;
                } else if (e.calculation === "percentage") {
                  target.willpower *= (100 + power) / 100;
                }
              } else if (general === "Speed") {
                if (e.calculation === "static") {
                  target.speed += power;
                } else if (e.calculation === "percentage") {
                  target.speed *= (100 + power) / 100;
                }
              }
            });
          }
        } else if (e.type === "flee") {
          // TODO: Flee from battle
        } else if (e.type === "damagegivenadjust") {
          // TODO: Account for level power effect
          const power = e.power;
          consequences.forEach((consequence, effectId) => {
            if (consequence.userId === e.targetId && consequence.damage) {
              const damageEffect = usersEffects.find((e) => e.id === effectId);
              if (damageEffect) {
                let attacks = 0;
                let defended = 0;
                // Calculate how much damage to adjust based on stats.
                if ("statTypes" in damageEffect) {
                  damageEffect.statTypes?.forEach((stat) => {
                    attacks += 1;
                    if ("statTypes" in e && e.statTypes?.includes(stat)) {
                      defended += 1;
                    }
                  });
                }
                if ("generalTypes" in damageEffect) {
                  damageEffect.generalTypes?.forEach((stat) => {
                    attacks += 1;
                    if ("generalTypes" in e && e.generalTypes?.includes(stat)) {
                      defended += 1;
                    }
                  });
                }
                if ("elements" in damageEffect) {
                  damageEffect.elements?.forEach((stat) => {
                    attacks += 1;
                    if ("elements" in e && e.elements?.includes(stat)) {
                      defended += 1;
                    }
                  });
                }
                const ratio = defended / attacks;
                const change =
                  e.calculation === "percentage"
                    ? (power / 100) * consequence.damage
                    : power;
                consequence.damage = consequence.damage + change * ratio;
              }
            }
          });
        } else if (e.type === "damagetakenadjust") {
          // TODO: Account for level power effect
          const power = e.power;
          consequences.forEach((consequence, effectId) => {
            if (consequence.targetId === e.targetId && consequence.damage) {
              const damageEffect = usersEffects.find((e) => e.id === effectId);
              if (damageEffect) {
                let attacks = 0;
                let defended = 0;
                // Calculate how much damage to adjust based on stats.
                if ("statTypes" in damageEffect) {
                  damageEffect.statTypes?.forEach((stat) => {
                    attacks += 1;
                    if ("statTypes" in e && e.statTypes?.includes(stat)) {
                      defended += 1;
                    }
                  });
                }
                if ("generalTypes" in damageEffect) {
                  damageEffect.generalTypes?.forEach((stat) => {
                    attacks += 1;
                    if ("generalTypes" in e && e.generalTypes?.includes(stat)) {
                      defended += 1;
                    }
                  });
                }
                if ("elements" in damageEffect) {
                  damageEffect.elements?.forEach((stat) => {
                    attacks += 1;
                    if ("elements" in e && e.elements?.includes(stat)) {
                      defended += 1;
                    }
                  });
                }
                const ratio = defended / attacks;
                const change =
                  e.calculation === "percentage"
                    ? (power / 100) * consequence.damage
                    : power;
                consequence.damage = consequence.damage - change * ratio;
              }
            }
          });
        } else if (e.type === "healadjust") {
          // TODO: Account for level power effect
          const power = e.power;
          consequences.forEach((consequence, effectId) => {
            if (consequence.userId === e.targetId && consequence.heal) {
              const healEffect = usersEffects.find((e) => e.id === effectId);
              if (healEffect) {
                let healAttrs = 0;
                let adjustAttrs = 0;
                // Calculate how much damage to adjust based on stats.
                if ("statTypes" in healEffect) {
                  healEffect.statTypes?.forEach((stat) => {
                    healAttrs += 1;
                    if ("statTypes" in e && e.statTypes?.includes(stat)) {
                      adjustAttrs += 1;
                    }
                  });
                }
                if ("generalTypes" in healEffect) {
                  healEffect.generalTypes?.forEach((stat) => {
                    healAttrs += 1;
                    if ("generalTypes" in e && e.generalTypes?.includes(stat)) {
                      adjustAttrs += 1;
                    }
                  });
                }
                if ("elements" in healEffect) {
                  healEffect.elements?.forEach((stat) => {
                    healAttrs += 1;
                    if ("elements" in e && e.elements?.includes(stat)) {
                      adjustAttrs += 1;
                    }
                  });
                }
                const ratio = adjustAttrs / healAttrs;
                const change =
                  e.calculation === "percentage"
                    ? (power / 100) * consequence.heal
                    : power;
                consequence.heal = consequence.heal + change * ratio;
              }
            }
          });
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

  // Collapse damage/heal effects & then apply
  Array.from(consequences.values())
    .reduce((acc, val) => {
      const current = acc.find((c) => c.targetId === val.targetId);
      if (current) {
        if (val.damage) {
          current.damage = current.damage ? current.damage + val.damage : val.damage;
        }
        if (val.heal) {
          current.heal = current.heal ? current.heal + val.heal : val.heal;
        }
      } else {
        acc.push(val);
      }
      return acc;
    }, [] as Consequence[])
    .forEach((c) => {
      const target = newUsersState.find((u) => u.userId === c.targetId);
      if (target) {
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
        // Process disappear animation of characters
        if (target.cur_health <= 0 && !target.is_original) {
          addVisualEffect({
            creatorId: c.userId,
            appearAnimation: "smoke",
            longitude: target.longitude,
            latitude: target.latitude,
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
