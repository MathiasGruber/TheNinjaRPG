import type {
  ReturnedBattle,
  ReturnedUserState,
  UserEffect,
} from "@/libs/combat/types";
import { getEffectiveMaxPool } from "@/libs/combat/util";

/**
 * Cache display maxima within one scene. Battle updates replace the snapshot or
 * advance its version; previews can replace effects without advancing the version.
 * Keep the full effect context so bloodline sealing matches combat calculations.
 */
export const createCombatMaxPoolCache = () => {
  let snapshot: ReturnedBattle | undefined;
  let version: number | undefined;
  let effects: UserEffect[] | undefined;
  let calculatedAt = 0;
  let expiresAt = 0;
  let users = new WeakMap<ReturnedUserState, CachedMaxPools>();

  return (
    user: ReturnedUserState,
    battle: ReturnedBattle,
    usersEffects: UserEffect[] | undefined,
  ) => {
    const now = Date.now();
    if (
      snapshot !== battle ||
      version !== battle.version ||
      effects !== usersEffects ||
      now >= expiresAt ||
      now < calculatedAt
    ) {
      snapshot = battle;
      version = battle.version;
      effects = usersEffects;
      calculatedAt = now;
      expiresAt = Number.POSITIVE_INFINITY;
      // Seals can expire independently of pool bonuses, restoring a bloodline bonus.
      for (const effect of usersEffects ?? []) {
        const expiry = effect.timedBuffExpiresAt;
        if (expiry && expiry > now) expiresAt = Math.min(expiresAt, expiry);
      }
      users = new WeakMap();
    }

    let cached = users.get(user);
    if (
      !cached ||
      cached.baseHealth !== user.maxHealth ||
      cached.baseStamina !== user.maxStamina ||
      cached.baseChakra !== user.maxChakra
    ) {
      cached = {
        baseHealth: user.maxHealth,
        baseStamina: user.maxStamina,
        baseChakra: user.maxChakra,
        health: getEffectiveMaxPool(user, usersEffects, "Health"),
        stamina:
          "maxStamina" in user
            ? getEffectiveMaxPool(user, usersEffects, "Stamina")
            : undefined,
        chakra:
          "maxChakra" in user
            ? getEffectiveMaxPool(user, usersEffects, "Chakra")
            : undefined,
      };
      users.set(user, cached);
    }
    return cached;
  };
};

type CachedMaxPools = {
  baseHealth: number;
  baseStamina: number | undefined;
  baseChakra: number | undefined;
  health: number;
  stamina: number | undefined;
  chakra: number | undefined;
};
