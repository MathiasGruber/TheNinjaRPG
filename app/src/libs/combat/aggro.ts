import { COMBAT_ENMITY_PER_DAMAGE } from "@/drizzle/constants";
import { getPower, sealCheck } from "./tags";
import type { BattleUserState, UserEffect } from "./types";
import { canStackEffect, getEffectStackKey, isEffectActive } from "./util";

/** Damage threat belongs to the actor, including summons, and excludes friendly fire. */
export const creditDamageEnmity = (
  attacker: BattleUserState,
  target: BattleUserState,
  healthLost: number,
  effects: UserEffect[],
): void => {
  if (
    healthLost <= 0 ||
    attacker.userId === target.userId ||
    attacker.direction === target.direction
  )
    return;
  const base = healthLost * COMBAT_ENMITY_PER_DAMAGE;
  let percentage = 0;
  let flat = 0;
  const applied = new Set<string>();
  const seals = effects.filter(
    (e) => e.type === "seal" && !e.isNew && isEffectActive(e),
  );
  for (const effect of effects) {
    if (
      (effect.type !== "increaseaggro" && effect.type !== "decreaseaggro") ||
      effect.aggroMode !== "GENERATION" ||
      effect.targetId !== attacker.userId ||
      !isEffectActive(effect) ||
      sealCheck(effect, seals) ||
      !canStackEffect(effect, applied)
    )
      continue;
    applied.add(getEffectStackKey(effect));
    const sign = effect.type === "increaseaggro" ? 1 : -1;
    const power = getPower(effect).power * sign;
    if (effect.calculation === "percentage") percentage += power;
    else flat += power;
  }
  attacker.enmity =
    (attacker.enmity ?? 0) +
    Math.max(0, base * Math.max(0, 1 + percentage / 100) + flat);
};
