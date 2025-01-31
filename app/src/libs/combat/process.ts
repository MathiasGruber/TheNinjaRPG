import { dmgConfig as config } from "./constants";
import { VisualTag } from "./types";
import { findUser, findBarrier } from "./util";
import { collapseConsequences, sortEffects } from "./util";
import { calcApplyRatio } from "./util";
import { calcEffectRoundInfo, isEffectActive } from "./util";
import { nanoid } from "nanoid";
import { clone, move, heal, damageBarrier, damageUser, calcDmgModifier } from "./tags";
import { absorb, reflect, recoil, lifesteal, shield } from "./tags";
import { increaseStats, decreaseStats } from "./tags";
import { increaseDamageGiven, decreaseDamageGiven } from "./tags";
import { increaseDamageTaken, decreaseDamageTaken } from "./tags";
import { increaseHealGiven, decreaseHealGiven } from "./tags";
import { increasepoolcost, decreasepoolcost } from "./tags";
import { flee, fleePrevent } from "./tags";
import { stun, stunPrevent, onehitkill, onehitkillPrevent, movePrevent } from "./tags";
import {
  seal,
  sealPrevent,
  sealCheck,
  rob,
  robPrevent,
  stealth,
  elementalseal,
} from "./tags";
import { clear, cleanse, summon, summonPrevent, buffPrevent, weakness } from "./tags";
import { cleansePrevent, clearPrevent, healPrevent, debuffPrevent } from "./tags";
import { updateStatUsage } from "./tags";
import { BATTLE_TAG_STACKING, ID_ANIMATION_SMOKE } from "@/drizzle/constants";
import type { BattleUserState, ReturnedUserState } from "./types";
import type { GroundEffect, UserEffect, ActionEffect, BattleEffect } from "./types";
import type { CompleteBattle, Consequence } from "./types";
import type { ShieldTagType } from "./types";
/**
 * Check whether to apply given effect to a user, based on friendly fire settings
 */
export const checkFriendlyFire = (
  effect: BattleEffect,
  target: ReturnedUserState,
  usersState: ReturnedUserState[],
) => {
  // Find the creator of the effect
  const creator = usersState.find((u) => u.userId === effect.creatorId);
  if (!creator) return false;

  // For summoned units, always check if they belong to the creator
  if (target.isSummon) {
    const isFriendly = target.controllerId === creator.userId;
    return effect.friendlyFire === "FRIENDLY" ? isFriendly : !isFriendly;
  }

  // Get unique village IDs from real (non-summoned) users
  const uniqueVillages = new Set(
    usersState.filter((u) => !u.isSummon).map((u) => u.villageId),
  );

  // If all real users are from the same village, treat them as enemies
  const isIntraVillageBattle = uniqueVillages.size === 1;

  // In same-village battles, everyone except summons is an enemy
  if (isIntraVillageBattle) {
    if (!effect.friendlyFire || effect.friendlyFire === "ALL") {
      return true; // Allow all
    }
    if (effect.friendlyFire === "FRIENDLY") {
      return false; // Block friendly-only effects in intra-village battles
    }
    if (effect.friendlyFire === "ENEMIES") {
      return effect.creatorId !== target.userId; // Only allow targeting others, not self
    }
    return false;
  }

  // In multi-village battles, players from same village are allies
  const isFriendly = creator.villageId === target.villageId;

  // Check if effect should be applied based on friendly fire settings
  if (!effect.friendlyFire || effect.friendlyFire === "ALL") {
    return true; // Allow all
  }
  if (effect.friendlyFire === "FRIENDLY") {
    return isFriendly; // Only apply to friends (same village)
  }
  if (effect.friendlyFire === "ENEMIES") {
    return !isFriendly; // Only apply to enemies (different village)
  }
  return false;
};

/**
 * Realize tag with information about how powerful tag is
 */
export const realizeTag = <T extends BattleEffect>(props: {
  tag: T;
  user: BattleUserState;
  actionId: string;
  target?: BattleUserState | undefined;
  level: number | undefined;
  round?: number;
  barrierAbsorb?: number;
}): T => {
  const { tag, user, target, level, round, barrierAbsorb } = props;
  if ("rounds" in tag) {
    tag.timeTracker = {};
  }
  if ("power" in tag) {
    tag.power = tag.power;
  }
  tag.id = nanoid();
  tag.createdRound = round || 0;
  tag.creatorId = user.userId;
  tag.villageId = user.villageId;
  tag.targetType = "user";
  tag.level = level ?? 0;
  tag.isNew = true;
  tag.castThisRound = true;
  tag.highestOffence = user.highestOffence;
  tag.highestDefence = user.highestDefence;
  tag.highestGenerals = user.highestGenerals;
  tag.barrierAbsorb = barrierAbsorb || 0;
  tag.actionId = props.actionId;
  if (target) {
    tag.targetHighestOffence = target.highestOffence;
    tag.targetHighestDefence = target.highestDefence;
    tag.targetHighestGenerals = target.highestGenerals;
  }
  return structuredClone(tag);
};

/**
 * Create a visual effect with a specified appearAnimation
 */
const getVisual = (
  longitude: number,
  latitude: number,
  animation?: string,
  round = 0,
): GroundEffect => {
  return {
    ...VisualTag.parse({
      type: "visual",
      rounds: 0,
      description: "N/A",
      appearAnimation: animation,
      createdAt: Date.now(),
    }),
    actionId: "visual",
    id: nanoid(),
    createdRound: round,
    creatorId: nanoid(),
    level: 0,
    barrierAbsorb: 0,
    isNew: true,
    castThisRound: true,
    longitude,
    latitude,
  };
};

export const applyEffects = (battle: CompleteBattle, actorId: string) => {
  // Destructure
  const { usersState, usersEffects, groundEffects, round } = battle;
  const actor = usersState.find((u) => u.userId === actorId);

  // Things we wish to return
  const newUsersState = structuredClone(usersState);
  const newGroundEffects: GroundEffect[] = [];
  const newUsersEffects: UserEffect[] = [];
  const actionEffects: ActionEffect[] = [];

  // Convert all ground effects to user effects on the users standing on the tile
  groundEffects.sort(sortEffects).forEach((e) => {
    // Get the round information for the effect
    const { startRound, curRound } = calcEffectRoundInfo(e, battle);
    e.castThisRound = startRound === curRound;
    // Process special effects
    let info: ActionEffect | undefined = undefined;
    if (e.type === "move") {
      move(e, usersEffects, newUsersState, newGroundEffects);
    } else {
      // Special handling of clone & summon ground-effects
      if (e.type === "clone") {
        info = clone(newUsersState, e);
      } else if (e.type === "summon") {
        info = summon(newUsersState, e);
      } else if (e.type === "barrier") {
        const user = findUser(newUsersState, e.longitude, e.latitude);
        if (user) e.rounds = 0;
      } else {
        // Information on what was done
        if (e.isNew && e.castThisRound && actor && e.type !== "visual" && e.rounds) {
          const txt = `${actor.username} marked the ground with ${e.type} for the next ${e.rounds} rounds`;
          if (!actionEffects.find((ae) => ae.txt === txt)) {
            actionEffects.push({ txt, color: "blue" });
          }
        }
        // Apply all other ground effects to user
        const user = findUser(newUsersState, e.longitude, e.latitude);
        if (user && e.type !== "visual") {
          if (checkFriendlyFire(e, user, newUsersState)) {
            const hasEffect = usersEffects.some((ue) => ue.id === e.id);
            const isInstant = ["damage", "heal", "pierce"].includes(e.type);
            if (!hasEffect) {
              // NOTE:
              // 1. If the effect is instant, it is applied immediately
              // 2. User effects from Ground effects are not forwarded to the next round
              usersEffects.push({
                ...e,
                rounds: isInstant ? 0 : 1,
                targetId: user.userId,
                createdRound: isInstant ? curRound : curRound - 1,
                fromGround: true,
              } as UserEffect);
            }
          }
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
      }

      // Show once appearing animation
      if (e.appearAnimation && e.isNew && e.type !== "visual") {
        newGroundEffects.push(
          getVisual(e.longitude, e.latitude, e.appearAnimation, round),
        );
      }

      // Process round reduction & tag removal
      if (isEffectActive(e) || e.type === "visual") {
        e.isNew = false;
        newGroundEffects.push(e);
      } else if (e.disappearAnimation) {
        newGroundEffects.push(
          getVisual(e.longitude, e.latitude, e.disappearAnimation, round),
        );
      }
    }

    // Add info to action effects if it exists
    if (info) actionEffects.push(info);
  });

  // Book-keeping for damage and heal effects
  const consequences = new Map<string, Consequence>();

  // Fetch any active sealing effects
  const sealEffects = usersEffects.filter(
    (e) => e.type === "seal" && !e.isNew && isEffectActive(e),
  );

  // Remember effects applied to different users, so that we only apply effects once
  const appliedEffects = new Set<string>();

  // Apply all user effects to their target users
  usersEffects.sort(sortEffects).forEach((e) => {
    // Get the round information for the effect
    const { startRound, curRound } = calcEffectRoundInfo(e, battle);
    e.castThisRound = startRound === curRound;
    // Bookkeeping
    let longitude: number | undefined = undefined;
    let latitude: number | undefined = undefined;
    let info: ActionEffect | undefined = undefined;
    // Get user now and next
    const curUser = usersState.find((u) => u.userId === e.creatorId);
    const newUser = newUsersState.find((u) => u.userId === e.creatorId);
    // Remember the effect
    const idx = `${e.type}-${e.creatorId}-${e.targetId}-${e.fromType}`;
    // Determine whether the tags should stack
    const cacheCheck = BATTLE_TAG_STACKING
      ? true
      : !appliedEffects.has(idx) ||
        e.fromType === "bloodline" ||
        e.fromType === "armor";
    // Special cases
    if (
      ["damage", "pierce"].includes(e.type) &&
      e.targetType === "barrier" &&
      curUser
    ) {
      const result = damageBarrier(newGroundEffects, curUser, e, config);
      if (result) {
        longitude = result.barrier.longitude;
        latitude = result.barrier.latitude;
        actionEffects.push(result.info);
      }
    } else if (e.targetType === "user" && cacheCheck) {
      // Get the user && effect details
      const curTarget = usersState.find((u) => u.userId === e.targetId);
      const newTarget = newUsersState.find((u) => u.userId === e.targetId);
      const isSealed = sealCheck(e, sealEffects);
      const isTargetOrNew = e.targetId === actorId || e.isNew;
      if (curUser && newUser && curTarget && newTarget && !isSealed) {
        appliedEffects.add(idx);
        longitude = curTarget?.longitude;
        latitude = curTarget?.latitude;
        // Figure if tag should be applied
        const ratio = calcApplyRatio(e, battle, e.targetId, isTargetOrNew);
        if (ratio > 0) {
          // Tags only applied when target is user or new
          if (isTargetOrNew) {
            if (e.type === "damage" && isTargetOrNew) {
              const modifier = calcDmgModifier(e, curTarget, usersEffects);
              info = damageUser(e, curUser, curTarget, consequences, modifier, config);
            } else if (e.type === "pierce" && isTargetOrNew) {
              const modifier = calcDmgModifier(e, curTarget, usersEffects);
              info = damageUser(e, newUser, newTarget, consequences, modifier, config);
            } else if (e.type === "heal" && isTargetOrNew) {
              info = heal(e, newUsersEffects, curTarget, consequences, ratio);
            } else if (e.type === "flee" && isTargetOrNew) {
              info = flee(e, newUsersEffects, newTarget);
            } else if (e.type === "increasepoolcost" && isTargetOrNew) {
              info = increasepoolcost(e, curTarget);
            } else if (e.type === "decreasepoolcost" && isTargetOrNew) {
              info = decreasepoolcost(e, curTarget);
            } else if (e.type === "clear" && isTargetOrNew) {
              info = clear(e, usersEffects, curTarget);
            } else if (e.type === "cleanse" && isTargetOrNew) {
              info = cleanse(e, usersEffects, curTarget);
            } else if (e.type === "increasedamagegiven") {
              info = increaseDamageGiven(e, usersEffects, consequences, curTarget);
            } else if (e.type === "decreasedamagegiven") {
              info = decreaseDamageGiven(e, usersEffects, consequences, curTarget);
            } else if (e.type === "onehitkill") {
              info = onehitkill(e, newUsersEffects, newTarget);
            } else if (e.type === "rob") {
              info = rob(e, newUsersEffects, newUser, newTarget, battle.battleType);
            } else if (e.type === "seal") {
              info = seal(e, newUsersEffects, curTarget);
            } else if (e.type === "stun") {
              info = stun(e, newUsersEffects, curTarget);
            }
          }

          // Always apply
          if (e.type === "absorb") {
            info = absorb(e, usersEffects, consequences, curTarget);
          } else if (e.type === "increasestat") {
            info = increaseStats(e, newUsersEffects, curTarget);
          } else if (e.type === "decreasestat") {
            info = decreaseStats(e, newUsersEffects, curTarget);
          } else if (e.type === "increasedamagetaken") {
            info = increaseDamageTaken(e, usersEffects, consequences, curTarget);
          } else if (e.type === "decreasedamagetaken") {
            info = decreaseDamageTaken(e, usersEffects, consequences, curTarget);
          } else if (e.type === "increaseheal") {
            info = increaseHealGiven(e, usersEffects, consequences, curTarget);
          } else if (e.type === "decreaseheal") {
            info = decreaseHealGiven(e, usersEffects, consequences, curTarget);
          } else if (e.type === "reflect") {
            info = reflect(e, usersEffects, consequences, curTarget);
          } else if (e.type === "recoil") {
            info = recoil(e, usersEffects, consequences, curTarget);
          } else if (e.type === "lifesteal") {
            info = lifesteal(e, usersEffects, consequences, curTarget);
          } else if (e.type === "fleeprevent") {
            info = fleePrevent(e, curTarget);
          } else if (e.type === "healprevent") {
            info = healPrevent(e, curTarget);
          } else if (e.type === "stealth") {
            info = stealth(e, curTarget);
          } else if (e.type === "elementalseal") {
            info = elementalseal(e, curTarget);
          } else if (e.type === "buffprevent") {
            info = buffPrevent(e, curTarget);
          } else if (e.type === "debuffprevent") {
            info = debuffPrevent(e, curTarget);
          } else if (e.type === "onehitkillprevent") {
            info = onehitkillPrevent(e, curTarget);
          } else if (e.type === "robprevent") {
            info = robPrevent(e, curTarget);
          } else if (e.type === "cleanseprevent") {
            info = cleansePrevent(e, curTarget);
          } else if (e.type === "clearprevent") {
            info = clearPrevent(e, curTarget);
          } else if (e.type === "sealprevent") {
            info = sealPrevent(e, curTarget);
          } else if (e.type === "stunprevent") {
            info = stunPrevent(e, curTarget);
          } else if (e.type === "moveprevent") {
            info = movePrevent(e, curTarget);
          } else if (e.type === "summonprevent") {
            info = summonPrevent(e, curTarget);
          } else if (e.type === "weakness") {
            info = weakness(e, curTarget);
          } else if (e.type === "shield") {
            info = shield(e, curTarget);
          }
          updateStatUsage(newTarget, e, true);
        }
      }
    }

    // Show text results of actions
    if (info) {
      actionEffects.push(info);
    }

    // Show once appearing animation
    if (e.appearAnimation && longitude && latitude) {
      newGroundEffects.push(
        getVisual(longitude, latitude, e.appearAnimation, battle.round),
      );
    }

    // Process round reduction & tag removal
    if ((isEffectActive(e) && !e.fromGround) || e.type === "visual") {
      e.isNew = false;
      newUsersEffects.push(e);
    } else if (e.disappearAnimation && longitude && latitude) {
      newGroundEffects.push(
        getVisual(longitude, latitude, e.disappearAnimation, round),
      );
    }
  });

  // Apply consequences to users
  Array.from(consequences.values())
    .reduce(collapseConsequences, [] as Consequence[])
    .forEach((c) => {
      // Convenience variables & methods
      const user = newUsersState.find((u) => u.userId === c.userId);
      const target = newUsersState.find((u) => u.userId === c.targetId);
      const targetShields = newUsersEffects.filter(
        (e) => e.type === "shield" && e.targetId === c.targetId && e.power > 0,
      ) as ShieldTagType[];
      const calcAdjustedDamage = (target: BattleUserState, originalDamage: number) => {
        // For negative changes, first reduce shields
        let remainingDamage = Math.abs(originalDamage);
        targetShields.forEach((shield) => {
          if (remainingDamage > 0 && shield.power && shield.power > 0) {
            console.log("shield", remainingDamage, shield.power);
            const absorbed = Math.min(remainingDamage, shield.power);
            shield.power -= absorbed;
            remainingDamage -= absorbed;
            if (shield.power > 0) {
              actionEffects.push({
                txt: `${target.username}'s shield absorbs ${absorbed.toFixed(2)} damage. ${shield.power.toFixed(2)} remaining.`,
                color: "red",
              });
            } else {
              actionEffects.push({
                txt: `${target.username}'s shield absorbs ${absorbed.toFixed(2)} damage and is destroyed`,
                color: "red",
              });
            }
          }
        });
        return remainingDamage;
      };
      // Apply all the consequences
      if (target && user) {
        if (c.damage && c.damage > 0) {
          const damage = calcAdjustedDamage(target, c.damage);
          if (damage > 0) {
            target.curHealth -= damage;
            target.curHealth = Math.max(0, target.curHealth);
            actionEffects.push({
              txt: `${target.username} takes ${damage.toFixed(2)} damage`,
              color: "red",
              types: c.types,
            });
          }
        }
        if (c.residual && c.residual > 0) {
          const damage = calcAdjustedDamage(target, c.residual);
          if (damage > 0) {
            target.curHealth -= damage;
            target.curHealth = Math.max(0, target.curHealth);
            actionEffects.push({
              txt: `${target.username} takes ${damage.toFixed(2)} residual damage`,
              color: "red",
              types: c.types,
            });
          }
        }
        if (c.heal_hp && c.heal_hp > 0 && target.curHealth > 0) {
          target.curHealth += c.heal_hp;
          target.curHealth = Math.min(target.maxHealth, target.curHealth);
          actionEffects.push({
            txt: `${target.username} heals ${c.heal_hp} HP`,
            color: "green",
          });
        }
        if (c.heal_sp && c.heal_sp > 0) {
          target.curStamina += c.heal_sp;
          target.curStamina = Math.min(target.maxStamina, target.curStamina);
          actionEffects.push({
            txt: `${target.username} heals ${c.heal_sp} SP`,
            color: "green",
          });
        }
        if (c.heal_cp && c.heal_cp > 0) {
          target.curChakra += c.heal_cp;
          target.curChakra = Math.min(target.maxChakra, target.curChakra);
          actionEffects.push({
            txt: `${target.username} heals ${c.heal_cp} CP`,
            color: "green",
          });
        }
        if (c.reflect && c.reflect > 0) {
          const damage = calcAdjustedDamage(user, c.reflect);
          if (damage > 0) {
            user.curHealth -= damage;
            user.curHealth = Math.max(0, user.curHealth);
            actionEffects.push({
              txt: `${user.username} takes ${damage.toFixed(2)} reflect damage`,
              color: "red",
            });
          }
        }
        if (c.recoil && c.recoil > 0) {
          const damage = calcAdjustedDamage(user, c.recoil);
          if (damage > 0) {
            user.curHealth -= damage;
            user.curHealth = Math.max(0, user.curHealth);
            actionEffects.push({
              txt: `${user.username} takes ${damage.toFixed(2)} recoil damage`,
              color: "red",
            });
          }
        }
        if (c.lifesteal_hp && c.lifesteal_hp > 0 && target.curHealth > 0) {
          user.curHealth += c.lifesteal_hp;
          user.curHealth = Math.min(user.maxHealth, user.curHealth);
          actionEffects.push({
            txt: `${user.username} steals ${c.lifesteal_hp.toFixed(2)} damage as health`,
            color: "green",
          });
        }
        if (c.absorb_hp && c.absorb_hp > 0 && target.curHealth > 0) {
          target.curHealth += c.absorb_hp;
          target.curHealth = Math.min(target.maxHealth, target.curHealth);
          actionEffects.push({
            txt: `${target.username} absorbs ${c.absorb_hp.toFixed(
              2,
            )} damage and converts it to health`,
            color: "green",
          });
        }
        if (c.absorb_sp && c.absorb_sp > 0) {
          target.curStamina += c.absorb_sp;
          target.curStamina = Math.min(target.maxHealth, target.curStamina);
          actionEffects.push({
            txt: `${target.username} absorbs ${c.absorb_sp.toFixed(
              2,
            )} damage and converts it to stamina`,
            color: "green",
          });
        }
        if (c.absorb_cp && c.absorb_cp > 0) {
          target.curChakra += c.absorb_cp;
          target.curChakra = Math.min(target.maxHealth, target.curChakra);
          actionEffects.push({
            txt: `${target.username} absorbs ${c.absorb_cp.toFixed(
              2,
            )} damage and converts it to chakra`,
            color: "green",
          });
        }
        // Process disappear animation of characters
        if (target.curHealth <= 0 && !target.isOriginal) {
          newGroundEffects.push(
            getVisual(target.longitude, target.latitude, ID_ANIMATION_SMOKE, round),
          );
        }
        if (user.curHealth <= 0 && !user.isOriginal) {
          newGroundEffects.push(
            getVisual(user.longitude, user.latitude, ID_ANIMATION_SMOKE, round),
          );
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
