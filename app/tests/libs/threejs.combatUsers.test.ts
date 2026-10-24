import { afterEach, describe, expect, it, vi } from "bun:test";
import { Grid, rectangle } from "honeycomb-grid";
import { Group, Sprite } from "three";
import { defineHex } from "@/libs/hexgrid";
import { getEffectiveMaxPool } from "@/libs/combat/util";
import { drawCombatUsers, resetCombatCaches } from "@/libs/threejs/combat";
import { makeBattleUser, makeCompleteBattle, makeEffect } from "./combat/helpers/battleScenario";

type DrawInfo = Parameters<typeof drawCombatUsers>[0];

afterEach(() => {
  vi.restoreAllMocks();
  resetCombatCaches();
});

const fixture = (count = 1) => {
  const users = Array.from({ length: count }, (_, i) =>
    makeBattleUser(`user-${i}`, {
      longitude: i % 10,
      latitude: Math.floor(i / 10),
      curHealth: 50,
      maxHealth: 100,
      curStamina: 40,
      maxStamina: 80,
      curChakra: 30,
      maxChakra: 60,
    }),
  );
  const group_users = new Group();
  for (const user of users) {
    const mesh = new Group();
    mesh.name = user.userId;
    const halo = new Group();
    halo.name = "aggro_halo";
    mesh.add(halo);
    for (const name of ["hp_current", "sp_current", "cp_current"]) {
      const bar = new Sprite();
      bar.name = name;
      bar.userData.full_width = 1;
      bar.userData.originalX = 0;
      mesh.add(bar);
    }
    group_users.add(mesh);
  }
  const battle = makeCompleteBattle({ usersState: users, usersEffects: [] });
  const info: DrawInfo = {
    group_users,
    users,
    usersEffects: battle.usersEffects,
    grid: new Grid(defineHex(), rectangle({ width: 20, height: 20 })),
    playerId: undefined,
    userData: { userId: "viewer" } as DrawInfo["userData"],
    battle,
  };
  return {
    info,
    user: users[0]!,
    value: (name = "hp_current") =>
      group_users.children[0]!.getObjectByName(name)!.userData.previousValue as number,
  };
};

const poolBonus = (targetId = "user-0") =>
  makeEffect("increasemaxpools", {
    power: 20,
    calculation: "percentage",
    poolsAffected: ["Health", "Stamina", "Chakra"],
    rounds: 10,
  }, { targetId });

describe("combat user pool bars", () => {
  it("does not rescan effects on unchanged frames", () => {
    const { info } = fixture(20);
    let targetReads = 0;
    info.usersEffects = info.users.flatMap((user) =>
      Array.from({ length: 10 }, () => new Proxy(poolBonus(user.userId), {
        get(target, key) {
          if (key === "targetId") targetReads++;
          return Reflect.get(target, key);
        },
      })),
    );
    drawCombatUsers(info);
    targetReads = 0;
    for (let frame = 0; frame < 60; frame++) drawCombatUsers(info);
    expect(targetReads).toBe(0);
  });

  it("preserves mixed pool modifiers, inactive effects and bloodline sealing", () => {
    const { info, user, value } = fixture();
    info.usersEffects = [
      poolBonus(),
      makeEffect("decreasemaxpools", {
        power: 7, calculation: "static", poolsAffected: ["Health"], rounds: 3,
      }, { targetId: user.userId }),
      { ...poolBonus(), rounds: 0 },
      { ...poolBonus(), targetId: "someone-else" },
      { ...poolBonus(), fromType: "bloodline" },
      makeEffect("seal", { rounds: 3 }, { targetId: user.userId, isNew: false }),
    ];
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 113);
    expect(value("sp_current")).toBeCloseTo(40 / 96);
    expect(value("cp_current")).toBeCloseTo(30 / 72);
    for (const [name, pool, current] of [
      ["hp_current", "Health", user.curHealth],
      ["sp_current", "Stamina", user.curStamina],
      ["cp_current", "Chakra", user.curChakra],
    ] as const) {
      expect(value(name)).toBeCloseTo(current / getEffectiveMaxPool(user, info.usersEffects, pool));
    }
  });

  it("refreshes on replaced effects and snapshots, including same-version previews", () => {
    const { info, value } = fixture();
    drawCombatUsers(info);
    expect(value()).toBe(0.5);
    info.usersEffects = [poolBonus()];
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 120);
    info.usersEffects[0]!.power = 40;
    info.battle = { ...info.battle };
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 140);
    info.usersEffects[0]!.rounds = 0;
    info.battle.version++;
    drawCombatUsers(info);
    expect(value()).toBe(0.5);
  });

  it("keeps current values live and refreshes changed base maxima and actors", () => {
    const { info, user, value } = fixture();
    info.usersEffects = [poolBonus()];
    drawCombatUsers(info);
    user.curHealth = 25;
    user.curStamina = 20;
    user.curChakra = 15;
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(25 / 120);
    expect(value("sp_current")).toBeCloseTo(20 / 96);
    expect(value("cp_current")).toBeCloseTo(15 / 72);
    user.maxHealth = 200;
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(25 / 240);
    info.users = [{ ...user, curHealth: 50, maxHealth: 100 }];
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 120);
  });

  it("refreshes at each timed pool expiry without a battle update", () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { info, value } = fixture();
    info.usersEffects = [
      { ...poolBonus(), timedBuffExpiresAt: 11_000 },
      { ...poolBonus(), timedBuffExpiresAt: 12_000 },
    ];
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 140);
    now = 11_000;
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 120);
    now = 12_000;
    drawCombatUsers(info);
    expect(value()).toBe(0.5);
    now = 10_000;
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 140);
  });

  it("restores a bloodline pool bonus when its seal expires between snapshots", () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { info, user, value } = fixture();
    info.usersEffects = [
      { ...poolBonus(), fromType: "bloodline" },
      makeEffect("seal", { rounds: 3 }, {
        targetId: user.userId, isNew: false, timedBuffExpiresAt: 11_000,
      }),
      makeEffect("seal", { rounds: 3 }, { targetId: user.userId, isNew: true }),
      makeEffect("seal", { rounds: 3 }, { targetId: "someone-else", isNew: false }),
    ];
    drawCombatUsers(info);
    expect(value()).toBe(0.5);
    now = 11_000;
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 120);
    expect(value("sp_current")).toBeCloseTo(40 / 96);
    expect(value("cp_current")).toBeCloseTo(30 / 72);
  });

  it("keeps masked opponents' private pool bars absent", () => {
    const { info, value } = fixture();
    const user = { ...info.users[0]! };
    for (const key of ["curStamina", "maxStamina", "curChakra", "maxChakra"]) {
      Reflect.deleteProperty(user, key);
    }
    info.users = [user];
    drawCombatUsers(info);
    expect(value()).toBe(0.5);
    expect(value("sp_current")).toBeUndefined();
    expect(value("cp_current")).toBeUndefined();
  });

  it("clears maxima when renderer caches reset", () => {
    const { info, value } = fixture();
    info.usersEffects = [poolBonus()];
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 120);
    info.usersEffects[0]!.power = 40;
    resetCombatCaches();
    drawCombatUsers(info);
    expect(value()).toBeCloseTo(50 / 140);
  });

  it("continues interpolating movement while maxima stay cached", () => {
    const { info, user } = fixture();
    drawCombatUsers(info);
    user.longitude = 1;
    expect(drawCombatUsers(info)).toBe(true);
    const position = info.group_users.children[0]!.position.clone();
    expect(drawCombatUsers(info)).toBe(true);
    expect(info.group_users.children[0]!.position.equals(position)).toBe(false);
  });

});
