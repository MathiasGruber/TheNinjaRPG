import type { ReturnedUserState } from "./types";
import type { GroundEffect, UserEffect, ActionEffect } from "./types";
import { formulaPower, damangeCalc } from "./calcs";

export const realizeUserTag = (tag: UserEffect, user: ReturnedUserState) => {
  tag.realizedPower = formulaPower(tag, user);
  return tag;
};

export const realizeGroundTag = (tag: GroundEffect, user: ReturnedUserState) => {
  tag.realizedPower = formulaPower(tag, user);
  return tag;
};

export const applyEffects = (
  usersState: ReturnedUserState[],
  usersEffects: UserEffect[],
  groundEffects: GroundEffect[]
) => {
  // Active effects to be applied to users state
  const active = [...usersEffects];

  // Convert all ground effects to user effects on the users standing on the tile
  const newGroundEffects: GroundEffect[] = [];
  groundEffects.forEach((e) => {
    if (e.type === "move") {
      const user = usersState.find((u) => u.userId === e.creatorId);
      if (user) user.longitude = e.longitude;
      if (user) user.latitude = e.latitude;
    } else {
      const user = usersState.find(
        (u) => u.longitude === e.longitude && u.latitude === e.latitude
      );
      if (user) active.push({ ...e, targetId: user.userId } as UserEffect);
      if ("rounds" in e && e.rounds && e.rounds > 1) {
        newGroundEffects.push({ ...e, rounds: e.rounds - 1 });
      }
    }
  });

  // Apply all user effects to their target users
  const newUsersEffects: UserEffect[] = [];
  const actionEffects: ActionEffect[] = [];
  active.forEach((e) => {
    console.log(e);
    if (e.type === "damage" && e.realizedPower) {
      const target = usersState.find((u) => u.userId === e.targetId);
      if (target) {
        const defensivePower = formulaPower(e, target, "defence");
        const damage = damangeCalc(e.realizedPower, defensivePower);
        target.cur_health -= damage;
        target.cur_health = Math.max(0, target.cur_health);
        actionEffects.push({ txt: e.battleEffect });
      }
    } else if (e.type === "flee") {
      // TODO: Flee from battle
    }
    if ("rounds" in e && e.rounds && e.rounds > 1) {
      newUsersEffects.push({ ...e, rounds: e.rounds - 1 });
    }
  });

  return {
    newUsersState: usersState,
    newUsersEffects,
    newGroundEffects,
    actionEffects,
  };
};
