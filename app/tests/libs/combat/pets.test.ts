import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { Grid, rectangle } from "honeycomb-grid";
import { BattleTypes, COMBAT_ENMITY_PER_DAMAGE, PET_BASE_STAT, PET_BATTLE_CONFIG } from "@/drizzle/constants";
import type { UserPet } from "@/drizzle/schema";
import { performAIaction } from "@/libs/combat/ai_v2";
import { addPetsToBattle, getPetSpawnLocation, petsAllowedInBattle } from "@/libs/combat/pets";
import { applyEffects } from "@/libs/combat/process";
import { hasLiveSummon, spliceOrphanedSummons } from "@/libs/combat/summon";
import { applyPoolAdjustmentsToBase, getTurnControl, resolveDamageCreditUser } from "@/libs/combat/util";
import { TerrainHex } from "@/libs/hexgrid";
import { makeBattleUser, makeBattleUserItem, makeCompleteBattle, makeEffect } from "./helpers/battleScenario";
import { AiRule } from "@/validators/ai";
import { IncreaseMaxPoolsTag, ShieldTag, SummonTag } from "@/validators/combat";
import { updatePetAiSchema } from "@/validators/pets";
import { ownedPetJutsu, ownedPetSkill, petJutsuFixture, petSkillFixture } from "../pets/helpers/abilities";

const petFixture = (patch: Partial<UserPet> = {}): UserPet => ({
  id: "pet-1", userId: "owner", name: "Nami", rank: 1, experience: 1000,
  storedExperience: 0, feedDay: null, abilitySlots: 1, jutsuIds: [], skillIds: [],
  speciesId: "pet-species-0", paletteIndex: 0, characteristicIndex: 0, auraIndex: 0,
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
      isAi: false, activePetId: "pet-1", direction: "left", rank: "GENIN", longitude: 3, latitude: 3,
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
  let previousBattleEnabled = PET_BATTLE_CONFIG.enabled;
  beforeEach(() => {
    previousBattleEnabled = PET_BATTLE_CONFIG.enabled;
    PET_BATTLE_CONFIG.enabled = true;
  });
  afterEach(() => {
    PET_BATTLE_CONFIG.enabled = previousBattleEnabled;
  });

  it.each([...BattleTypes])("excludes pets, abilities and settlement identities from %s while companion battles are disabled", (battleType) => {
    PET_BATTLE_CONFIG.enabled = false;
    const battle = scenario();
    battle.battleType = battleType;
    battle.extraState.petIdsByOwner = { owner: "previous-pet" };
    const originalUsers = structuredClone(battle.usersState);
    const originalEffects = structuredClone(battle.usersEffects);
    const jutsu = ownedPetJutsu(petJutsuFixture());
    const skill = ownedPetSkill(petSkillFixture());
    addPetsToBattle({ ...battle,
      pets: [petFixture({ jutsuIds: [jutsu.jutsuId], skillIds: [skill.skillId] })],
      abilitiesByOwner: { owner: { jutsus: [jutsu], skills: [skill] } },
    });
    expect(petsAllowedInBattle(battleType)).toBe(false);
    expect(battle.usersState).toEqual(originalUsers);
    expect(battle.usersEffects).toEqual(originalEffects);
    expect(battle.extraState.petIdsByOwner).toEqual({});
    expect(battle.extraState.aiProfiles).toEqual({});
    expect(battle.extraState.jutsus).toEqual({});
  });

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

  it("preloads learned abilities at level one and applies only the pet's selected self passives", () => {
    const battle = scenario();
    battle.usersState[0]!.rank = "CHUNIN";
    const learned = ownedPetJutsu();
    const skill = ownedPetSkill();
    addPetsToBattle({ ...battle,
      pets: [petFixture({ rank: 4, artRank: 4, experience: 100000, abilitySlots: 2,
        jutsuIds: [learned.jutsuId], skillIds: [skill.skillId] })],
      abilitiesByOwner: { owner: { jutsus: [learned], skills: [skill] } },
    });
    const actor = battle.usersState.find((u) => u.petId)!;
    expect(actor.jutsus).toMatchObject([{ jutsuId: learned.jutsuId, level: 1,
      originalCooldown: 1, lastUsedRound: -1, reskinId: null }]);
    expect(actor.jutsus[0]!.id).not.toBe(learned.id);
    expect(learned.level).toBe(25);
    expect(battle.extraState.jutsus[learned.jutsuId]).toEqual(learned.jutsu);
    expect(actor.activeSkillIds).toEqual([skill.skillId]);
    expect(battle.usersEffects.filter((effect) => effect.fromType === "skill"))
      .toMatchObject([{ creatorId: actor.userId, targetId: actor.userId, actionId: skill.skillId }]);
    const ownerStrength = battle.usersState[0]!.strength;
    const resolved = applyEffects(battle, actor.userId).newBattle;
    expect(actor.strength).toBeGreaterThan(30);
    expect(resolved.usersState.find((u) => u.petId)!.strength).toBe(30);
    expect(resolved.usersState.find((u) => u.userId === "owner")!.strength).toBe(ownerStrength);
  });

  it("executes a selected pet jutsu autonomously from the frozen catalog", () => {
    const battle = scenario();
    battle.usersState[1]!.longitude = 4;
    addPetsToBattle({ ...battle,
      pets: [petFixture({ jutsuIds: ["pet-strike"], includeDefaultRules: false,
        aiRules: [AiRule.parse({ conditions: [], action: {
          type: "use_specific_jutsu", jutsuId: "pet-strike", target: "CLOSEST_OPPONENT",
        } })] })],
      abilitiesByOwner: { owner: { jutsus: [ownedPetJutsu()], skills: [] } },
    });
    const actor = battle.usersState.find((u) => u.petId)!;
    const grid = new Grid(TerrainHex, rectangle({ width: 13, height: 9 }))
      .map((tile) => { tile.cost = 1; return tile; });
    const before = battle.usersState[1]!.curHealth;
    const result = performAIaction(battle, grid, actor.userId);
    expect(result.nextActionId).toBe("pet-strike");
    expect(result.nextBattle.usersState.find((u) => u.userId === "enemy")!.curHealth).toBeLessThan(before);
    expect(result.nextBattle.usersState.find((u) => u.petId)!.jutsus[0]!.lastUsedRound).toBe(battle.round);
  });

  it("casts its selected self shield through a saved highest-power AI rule", () => {
    const battle = scenario();
    const savedAi = updatePetAiSchema.parse({
      petId: "pet-1", includeDefaultRules: false,
      rules: [AiRule.parse({ conditions: [], action: {
        type: "use_highest_power_action", effect: "shield", target: "SELF",
      } })],
    });
    const jutsu = petJutsuFixture({ id: "pet-guard", target: "SELF", range: 0,
      effects: [ShieldTag.parse({ calculation: "static", power: 100, health: 100 })],
    });
    addPetsToBattle({ ...battle,
      pets: [petFixture({ jutsuIds: [jutsu.id], aiRules: savedAi.rules,
        includeDefaultRules: savedAi.includeDefaultRules })],
      abilitiesByOwner: { owner: { jutsus: [ownedPetJutsu(jutsu)], skills: [] } },
    });
    const actor = battle.usersState.find((user) => user.petId)!;
    const grid = new Grid(TerrainHex, rectangle({ width: 13, height: 9 }))
      .map((tile) => { tile.cost = 1; return tile; });
    const result = performAIaction(battle, grid, actor.userId);
    expect(result.nextActionId).toBe(jutsu.id);
    expect(result.nextBattle.usersEffects.filter((effect) => effect.type === "shield"))
      .toMatchObject([{ creatorId: actor.userId, targetId: actor.userId, health: 100 }]);
    expect(result.nextBattle.usersState.find((user) => user.petId)!.jutsus[0]!.lastUsedRound)
      .toBe(battle.round);
  });

  it("keeps the basic pet when selected abilities were removed, changed or belong to another owner", () => {
    const battle = scenario();
    const forbidden = ownedPetJutsu(petJutsuFixture({ effects: [SummonTag.parse({ aiId: "unloaded" })] }));
    addPetsToBattle({ ...battle,
      pets: [petFixture({ jutsuIds: [forbidden.jutsuId], skillIds: ["pet-muscle"] })],
      abilitiesByOwner: { owner: { jutsus: [forbidden],
        skills: [ownedPetSkill(petSkillFixture(), "someone-else")] } },
    });
    const actor = battle.usersState.find((u) => u.petId)!;
    expect(actor.jutsus).toEqual([]);
    expect(actor.activeSkillIds).toEqual([]);
    expect(actor.basicActions.length).toBeGreaterThan(0);
    expect(battle.extraState.petIdsByOwner).toEqual({ owner: "pet-1" });
    expect(battle.usersState.filter((u) => u.isSummon)).toHaveLength(1);
  });

  it("does not spawn more than one companion for an owner", () => {
    const battle = scenario();
    add(battle, [petFixture(), petFixture({ id: "inactive-pet" })]);
    expect(battle.usersState.filter((actor) => actor.petId)).toHaveLength(1);
    expect(battle.extraState.petIdsByOwner).toEqual({ owner: "pet-1" });
  });

  it("ignores a stale active-pet preload and spawns the owner's selected companion", () => {
    const battle = scenario();
    battle.usersState[0]!.activePetId = "selected-pet";
    add(battle, [petFixture(), petFixture({ id: "selected-pet" })]);
    expect(battle.usersState.filter((actor) => actor.petId).map((actor) => actor.petId))
      .toEqual(["selected-pet"]);
    expect(battle.extraState.petIdsByOwner).toEqual({ owner: "selected-pet" });
  });

  it("initializes selected pool passives without compounding or changing the owner's pools", () => {
    const battle = scenario();
    const skill = ownedPetSkill(petSkillFixture({ effects: [IncreaseMaxPoolsTag.parse({
      poolsAffected: ["Health"], calculation: "percentage", power: 20,
    })] }));
    addPetsToBattle({ ...battle, pets: [petFixture({ skillIds: [skill.skillId] })],
      abilitiesByOwner: { owner: { jutsus: [], skills: [skill] } },
    });
    const actor = battle.usersState.find((user) => user.petId)!;
    const originalHealth = actor.curHealth;
    const ownerHealth = battle.usersState[0]!.curHealth;
    applyPoolAdjustmentsToBase(actor, battle.usersEffects);
    expect(actor.curHealth).toBeGreaterThan(originalHealth);
    const adjustedHealth = actor.curHealth;
    applyPoolAdjustmentsToBase(actor, battle.usersEffects);
    expect(actor.curHealth).toBe(adjustedHealth);
    expect(battle.usersState[0]!.curHealth).toBe(ownerHealth);
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

  it.each(["same-village", "opposing-village"])("default clan pet AI approaches opponents and spares its teammates in %s matches", (enemyVillage) => {
    const battle = scenario();
    battle.battleType = "CLAN_BATTLE";
    battle.width = 12; battle.height = 10;
    battle.usersState = [
      makeBattleUser("owner", { isAi: false, activePetId: "pet-1", rank: "ELITE JONIN", villageId: "same-village", clanId: "clan-1", direction: "left", longitude: 3, latitude: 3, initiative: 22 }),
      makeBattleUser("ally", { isAi: false, activePetId: "ally-pet", rank: "ELITE JONIN", villageId: "same-village", clanId: "clan-1", direction: "left", longitude: 4, latitude: 3, initiative: 20.9 }),
      makeBattleUser("enemy-1", { isAi: false, rank: "ELITE JONIN", villageId: enemyVillage, clanId: "clan-2", direction: "right", longitude: 9, latitude: 3, initiative: 19.8 }),
      makeBattleUser("enemy-2", { isAi: false, rank: "ELITE JONIN", villageId: enemyVillage, clanId: "clan-2", direction: "right", longitude: 9, latitude: 5, initiative: 18.7 }),
    ];
    add(battle, [petFixture({ spawnPosition: "FRONT" }), petFixture({ id: "ally-pet", userId: "ally", spawnPosition: "FRONT" })]);
    const actor = battle.usersState.find((u) => u.petId === "pet-1")!;
    expect(actor).toMatchObject({ controllerId: "owner", clanId: "clan-1", villageId: "same-village", direction: "left", longitude: 4, latitude: 2 });
    expect(battle.extraState.aiProfiles[actor.aiProfileId!]!).toMatchObject({ rules: [], includeDefaultRules: true });
    battle.usersState.sort((left, right) => right.initiative - left.initiative);
    battle.activeUserId = actor.userId;
    const grid = new Grid(TerrainHex, rectangle({ width: battle.width, height: battle.height }))
      .map((tile) => { tile.cost = 1; return tile; });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { nextBattle, nextActionId } = performAIaction(battle, grid, actor.userId);
      expect(nextActionId).toBe("move");
      const moved = nextBattle.usersState.find((u) => u.userId === actor.userId)!;
      expect(moved.longitude).toBeGreaterThan(actor.longitude);
      for (const teammate of battle.usersState.filter((u) => u.direction === "left")) {
        expect(nextBattle.usersState.find((u) => u.userId === teammate.userId)?.curHealth).toBe(teammate.curHealth);
      }
    } finally {
      random.mockRestore();
    }
  });

  it("retreats with its defeated owner while retaining the frozen settlement identity", () => {
    const battle = scenario(); add(battle);
    battle.usersState[0]!.curHealth = 0;
    expect(spliceOrphanedSummons(battle.usersState, []).map((u) => u.petId)).toEqual(["pet-1"]);
    expect(battle.usersState.some((u) => u.petId)).toBe(false);
    expect(battle.extraState.petIdsByOwner).toEqual({ owner: "pet-1" });
  });
});
