import { describe, expect, it } from "bun:test";
import { Grid, rectangle } from "honeycomb-grid";
import { COMBAT_ENMITY_PER_DAMAGE, PET_BASE_STAT } from "@/drizzle/constants";
import type { UserPet } from "@/drizzle/schema";
import { performAIaction } from "@/libs/combat/ai_v2";
import { addPetsToBattle, getPetSpawnLocation } from "@/libs/combat/pets";
import { applyEffects } from "@/libs/combat/process";
import { hasLiveSummon, spliceOrphanedSummons } from "@/libs/combat/summon";
import { getTurnControl, resolveDamageCreditUser } from "@/libs/combat/util";
import { TerrainHex } from "@/libs/hexgrid";
import { makeBattleUser, makeBattleUserItem, makeCompleteBattle, makeEffect } from "./helpers/battleScenario";

const petFixture = (patch: Partial<UserPet> = {}): UserPet => ({
  id: "pet-1", userId: "owner", name: "Nami", rank: 1, experience: 1000,
  speciesIndex: 0, paletteIndex: 0, characteristicIndex: 0, auraIndex: 0,
  offence: 50, defence: 40, strength: 30, intelligence: 20, willpower: 10, speed: 25,
  avatar: "https://example.com/pet.png", avatarFacing: "left",
  battleEnabled: true, spawnPosition: "BEHIND", aiRules: [], includeDefaultRules: true,
  generationStatus: "READY", generationToken: null, generationStartedAt: null,
  generationAttempts: 0, generationDay: null,
  artRank: 1, revision: 0, createdAt: new Date(), updatedAt: new Date(), ...patch,
});
const scenario = () => makeCompleteBattle({
  battleType: "QUEST", width: 13, height: 9, version: 1,
  createdAt: new Date(), updatedAt: new Date(), roundStartAt: new Date(),
  usersState: [
    makeBattleUser("owner", {
      isAi: false, direction: "left", rank: "GENIN", longitude: 3, latitude: 3,
      bloodlineId: "bloodline", sageModeId: "sage", sageModeActivated: true,
      medicalExperience: 100000, isAutoCombat: true, elementalMastery: { Fire: 100 },
      activeSkillIds: ["skill"], items: [makeBattleUserItem()],
      effects: [makeEffect("damage")],
    }),
    makeBattleUser("enemy", {
      isAi: true, direction: "right", rank: "GENIN", longitude: 10, latitude: 3,
    }),
  ],
  extraState: {
    aiProfiles: {}, jutsus: {}, items: {}, bloodlines: {}, sageModes: {},
    villages: {}, anbuSquads: {}, clans: {}, wars: {}, relations: {},
    userQuests: {}, completedQuests: {}, questData: {}, bounties: {}, bountySignups: {},
  },
});
const add = (battle: ReturnType<typeof scenario>, pets = [petFixture()]) =>
  addPetsToBattle({ ...battle, pets });

describe("owned pets in combat", () => {
  it("uses pet progression and a distinct identity without inheriting the owner's abilities", () => {
    const battle = scenario();
    add(battle);
    const actor = battle.usersState.find((u) => u.petId === "pet-1");
    expect(actor).toBeDefined();
    expect(actor).toMatchObject({
      controllerId: "owner", username: "Nami", isAi: true, isSummon: true,
      isOriginal: true, isPiloted: false, isAutoCombat: false,
      offence: 50, strength: 30, bloodlineId: null, sageModeId: null,
      sageModeActivated: false, medicalExperience: 0,
      ninjutsuMastery: PET_BASE_STAT, jutsus: [], items: [], effects: [], activeSkillIds: [],
    });
    expect(actor?.userId).not.toBe("owner");
    expect(actor?.level).toBeLessThanOrEqual(5);
    expect(battle.extraState.petIdsByOwner).toEqual({ owner: "pet-1" });
    expect(battle.usersState[0]?.items).toHaveLength(1);
    expect(getTurnControl(actor!, "owner")).toEqual({ isUserTurn: false, isAITurn: true });
    expect(resolveDamageCreditUser(battle.usersState, actor!)?.userId).toBe("owner");
    expect(hasLiveSummon(battle.usersState, "owner", [])).toBe(false);
  });

  it("starts with its own threat and credits pet damage threat separately from owner quest damage", () => {
    const battle = scenario();
    const owner = battle.usersState[0]!;
    owner.enmity = 300;
    add(battle);
    const actor = battle.usersState.find((u) => u.petId === "pet-1")!;
    expect(actor.enmity).toBe(0);
    expect(owner.enmity).toBe(300);
    const target = battle.usersState.find((u) => u.userId === "enemy")!;
    const initialHealth = target.curHealth;
    battle.usersEffects = [makeEffect("damage", {
      calculation: "static", power: 100, rounds: 0,
    }, {
      creatorId: actor.userId, targetId: target.userId, targetType: "user",
      isNew: true, createdRound: battle.round, fromType: "jutsu",
    })];
    const resolved = applyEffects(battle, actor.userId).newBattle;
    const healthLost = initialHealth - resolved.usersState.find((u) => u.userId === "enemy")!.curHealth;
    const resolvedOwner = resolved.usersState.find((u) => u.userId === "owner")!;
    const resolvedPet = resolved.usersState.find((u) => u.petId === "pet-1")!;
    expect(healthLost).toBeGreaterThan(0);
    expect(resolvedPet.enmity).toBe(healthLost * COMBAT_ENMITY_PER_DAMAGE);
    expect(resolvedOwner.enmity).toBe(300);
    expect(resolvedOwner.damageDealt).toBe(healthLost);
    expect(resolvedPet.damageDealt).toBe(0);
  });

  it.each(["BEHIND", "FRONT", "LEFT", "RIGHT"] as const)(
    "allocates the %s relative position for either team", (position) => {
      for (const direction of ["left", "right"] as const) {
        const owner = { longitude: direction === "left" ? 3 : 9, latitude: 3, direction, curHealth: 100 };
        const location = getPetSpawnLocation(owner, position, [owner], 13, 9);
        const forward = direction === "left" ? 1 : -1;
        const expected = {
          BEHIND: { x: owner.longitude - forward, y: 3 },
          FRONT: { x: owner.longitude + forward, y: 3 },
          LEFT: { x: owner.longitude, y: 3 - forward },
          RIGHT: { x: owner.longitude, y: 3 + forward },
        }[position];
        expect(location).toEqual(expected);
      }
    },
  );

  it("falls back to an unoccupied team cell when the requested spot is occupied", () => {
    const battle = scenario();
    battle.usersState.push(makeBattleUser("ally", { direction: "left", longitude: 2, latitude: 3 }));
    add(battle);
    const actor = battle.usersState.find((u) => u.petId);
    expect(actor).toBeDefined();
    expect(battle.usersState.filter((u) => u.longitude === actor?.longitude && u.latitude === actor.latitude)).toHaveLength(1);
  });

  it.each([
    { battleEnabled: false }, { generationStatus: "PENDING" }, { artRank: 0 },
    { avatar: null }, { rank: 4, artRank: 4 },
  ] satisfies Partial<UserPet>[])("excludes an unavailable pet: %j", (patch) => {
    const battle = scenario();
    add(battle, [petFixture(patch)]);
    expect(battle.usersState).toHaveLength(2);
    expect(battle.extraState.petIdsByOwner).toEqual({});
  });

  it.each(["KAGE_AI", "CLAN_CHALLENGE", "RANKED_PVP", "RANKED_SPARRING"] as const)("preserves %s summon restrictions", (battleType) => {
    const battle = scenario(); battle.battleType = battleType;
    add(battle);
    expect(battle.usersState).toHaveLength(2);
    expect(battle.extraState.petIdsByOwner).toEqual({});
  });

  it("uses the owner's real rank when combat rank has been normalized", () => {
    const battle = scenario();
    battle.usersState[0]!.rank = "ELITE JONIN";
    addPetsToBattle({ ...battle, pets: [petFixture({ rank: 2, artRank: 2 })],
      ownerRanks: { owner: "STUDENT" } });
    expect(battle.usersState).toHaveLength(2);
    expect(battle.extraState.petIdsByOwner).toEqual({});
  });

  it("allows pets for ordinary player-versus-player combat", () => {
    const battle = scenario(); battle.battleType = "COMBAT";
    battle.usersState[1]!.isAi = false;
    add(battle);
    expect(battle.usersState.some((actor) => actor.petId === "pet-1")).toBe(true);
  });

  it("uses the normal autonomous AI with preloaded basic actions", () => {
    const battle = scenario(); add(battle);
    const actor = battle.usersState.find((u) => u.petId)!;
    const start = { x: actor.longitude, y: actor.latitude };
    const grid = new Grid(TerrainHex, rectangle({ width: 13, height: 9 }))
      .map((tile) => { tile.cost = 1; return tile; });
    const { nextBattle } = performAIaction(battle, grid, actor.userId);
    const moved = nextBattle.usersState.find((u) => u.userId === actor.userId)!;
    expect(moved.curHealth).toBeGreaterThan(0);
    expect({ x: moved.longitude, y: moved.latitude }).not.toEqual(start);
  });

  it("retreats with its defeated owner while retaining the frozen settlement identity", () => {
    const battle = scenario(); add(battle);
    battle.usersState[0]!.curHealth = 0;
    expect(spliceOrphanedSummons(battle.usersState, []).map((u) => u.petId)).toEqual(["pet-1"]);
    expect(battle.usersState.some((u) => u.petId)).toBe(false);
    expect(battle.extraState.petIdsByOwner).toEqual({ owner: "pet-1" });
  });
});
