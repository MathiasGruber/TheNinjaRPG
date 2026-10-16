import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { aiProfile, battle, itemLoadout, jutsu, skillTree, userData, userJutsu, userPet, petSpecies, userSkill } from "@/drizzle/schema";
import { getEffectiveMaxPool } from "@/libs/combat/util";
import { calcHP } from "@/libs/profile";
import { Pusher } from "@/libs/pusher";
import { combatRouter, initiateBattle } from "@/server/api/routers/combat";
import { IncreaseDamageGivenTag, IncreaseMaxPoolsTag, IncreaseStatTag, SummonTag } from "@/validators/combat";
import { initialPetSpecies } from "../../libs/pets/helpers/species";
import { petJutsuFixture, petSkillFixture } from "../../libs/pets/helpers/abilities";
import { insertPetSpecies, insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("companion ally passives at battle initiation", () => {
  beforeEach(async () => {
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(petSpecies, battle, aiProfile, itemLoadout, userJutsu, jutsu, userSkill, skillTree, userPet, userData);
    await insertPetSpecies(initialPetSpecies);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["left", "right"] as const)("includes only the caster's %s team and initializes pet pools once", async (direction) => {
    const client = await getTestDatabase();
    await insertUsers(["caster", "ally", "enemy"].map((userId) => ({
      userId, username: userId, rank: "GENIN", level: 5, status: "AWAKE",
      activePetId: userId === "ally" ? null : `${userId}-pet`,
    })));
    await insertUsers([{ userId: "summon-template", username: "Summon", isAi: true, level: 50 }]);
    await client.insert(aiProfile).values({ id: "Default", userId: "default-ai", rules: [] });
    await client.insert(jutsu).values(petJutsuFixture({
      id: "summon", effects: [SummonTag.parse({ aiId: "summon-template" })],
    }));
    await client.insert(userJutsu).values({ id: "owned-summon", userId: "caster", jutsuId: "summon", equipped: true });
    await client.insert(userPet).values(["caster", "enemy"].map((userId) => ({
      id: `${userId}-pet`, userId, name: `${userId} pet`,
      speciesId: "pet-species-0", paletteIndex: 0, characteristicIndex: 0, auraIndex: 0,
      generationStatus: "READY" as const, artRank: 1, avatar: "/pet.png",
      battleEnabled: true,
    })));
    const allies = petSkillFixture({ id: "allies", name: "Allies", target: "ALLIES", effects: [
      IncreaseStatTag.parse({ generalTypes: ["Strength"], power: 20, friendlyFire: "FRIENDLY" }),
      IncreaseMaxPoolsTag.parse({ poolsAffected: ["Health"], calculation: "percentage", power: 20, friendlyFire: "FRIENDLY" }),
      IncreaseDamageGivenTag.parse({ calculation: "percentage", power: 15, friendlyFire: "FRIENDLY" }),
    ] });
    const self = petSkillFixture({ id: "self", name: "Self" });
    const blocked = petSkillFixture({ id: "blocked", name: "Blocked", target: "ALLIES", effects: [
      IncreaseStatTag.parse({ generalTypes: ["Strength"], power: 999, friendlyFire: "ENEMIES" }),
    ] });
    await client.insert(skillTree).values([allies, self, blocked]);
    await client.insert(userSkill).values([allies, self, blocked].map((skill) => ({
      id: `owned-${skill.id}`, userId: "caster", skillId: skill.id, activated: true,
    })));

    expect((await initiateBattle({
      client,
      userIds: direction === "left" ? ["caster", "ally"] : ["enemy"],
      targetIds: direction === "left" ? ["enemy"] : ["caster", "ally"],
    }, "QUEST")).success).toBe(true);
    const initialized = (await client.query.battle.findFirst())!;
    const caster = initialized.usersState.find((actor) => actor.userId === "caster")!;
    const pet = initialized.usersState.find((actor) => actor.petId === "caster-pet")!;
    const enemyPet = initialized.usersState.find((actor) => actor.petId === "enemy-pet")!;
    expect(pet).toMatchObject({ direction, controllerId: "caster", activeSkillIds: [] });
    expect(enemyPet).toBeDefined();
    expect(initialized.usersState.some((actor) => actor.isSummonTemplate && actor.controllerId === "summon-template")).toBe(true);
    for (const type of ["increasestat", "increasemaxpools", "increasedamagegiven"]) {
      const effects = initialized.usersEffects.filter((effect) => effect.actionId === allies.id && effect.type === type);
      expect(effects.map((effect) => effect.targetId).sort()).toEqual(["caster", "ally", pet.userId].sort());
      for (const effect of effects) {
        const target = initialized.usersState.find((actor) => actor.userId === effect.targetId)!;
        expect(effect).toMatchObject({
          creatorId: caster.userId, level: caster.level,
          highestGenerals: caster.highestGenerals, targetHighestGenerals: target.highestGenerals,
          fromType: "skill", isNew: false, castThisRound: false,
        });
      }
    }
    expect(initialized.usersEffects.filter((effect) => effect.actionId === self.id).map((effect) => effect.targetId)).toEqual(["caster"]);
    expect(initialized.usersEffects.filter((effect) => effect.actionId === blocked.id)).toHaveLength(0);
    expect(pet.maxHealth).toBe(calcHP(pet.level));
    expect(getEffectiveMaxPool(pet, initialized.usersEffects, "Health")).toBeCloseTo(calcHP(pet.level) * 1.2);
    expect(pet.curHealth).toBeCloseTo(getEffectiveMaxPool(pet, initialized.usersEffects, "Health"));
    expect(enemyPet.maxHealth).toBe(calcHP(enemyPet.level));
  });

  it.each(["left", "right"] as const)("rebuilds the %s owner's ally passives on retained pets without regenerating pools", async (direction) => {
    const client = await getTestDatabase();
    await insertUsers(["owner", "enemy"].map((userId) => ({
      userId, username: userId, rank: "GENIN", level: 5, status: "AWAKE",
      activePetId: `${userId}-pet`,
    })));
    await client.insert(aiProfile).values({ id: "Default", userId: "default-ai", rules: [] });
    const allies = petSkillFixture({ id: "allies", name: "Allies", target: "ALLIES", effects: [
      IncreaseStatTag.parse({ generalTypes: ["Strength"], power: 20, friendlyFire: "FRIENDLY" }),
      IncreaseMaxPoolsTag.parse({ poolsAffected: ["Health"], calculation: "percentage", power: 20, friendlyFire: "FRIENDLY" }),
      IncreaseDamageGivenTag.parse({ calculation: "percentage", power: 15, friendlyFire: "FRIENDLY" }),
    ] });
    const self = petSkillFixture({ id: "self", name: "Self", effects: [IncreaseStatTag.parse({ generalTypes: ["Speed"], power: 10 })] });
    await client.insert(skillTree).values([allies, self]);
    await client.insert(userSkill).values([allies, self].map((skill) => ({
      id: `owned-${skill.id}`, userId: "owner", skillId: skill.id, activated: true,
    })));
    await client.insert(userPet).values(["owner", "enemy"].map((userId) => ({
      id: `${userId}-pet`, userId, name: `${userId} pet`,
      speciesId: "pet-species-0", paletteIndex: 0, characteristicIndex: 0, auraIndex: 0,
      generationStatus: "READY" as const, artRank: 1, avatar: "/pet.png",
      battleEnabled: true, skillIds: userId === "owner" ? [self.id] : [],
    })));
    await client.insert(itemLoadout).values(["first", "second"].map((id) => ({ id, userId: "owner", itemData: [] })));
    expect((await initiateBattle({
      client, userIds: direction === "left" ? ["owner"] : ["enemy"],
      targetIds: direction === "left" ? ["enemy"] : ["owner"],
    }, "SPARRING")).success).toBe(true);
    const initial = (await client.query.battle.findFirst())!;
    const owner = initial.usersState.find((actor) => actor.userId === "owner")!;
    const originalLocation = {
      longitude: owner.longitude, latitude: owner.latitude,
      originalLongitude: owner.originalLongitude, originalLatitude: owner.originalLatitude,
    };
    const pet = initial.usersState.find((actor) => actor.petId === "owner-pet")!;
    const originalPet = structuredClone(pet);
    const selfEffects = initial.usersEffects.filter((effect) => effect.creatorId === pet.userId);
    expect(selfEffects).toHaveLength(1);
    await client.update(battle).set({ roundStartAt: new Date(Date.now() + 120_000) }).where(eq(battle.id, initial.id));
    const caller = await callerFor(combatRouter, "owner");
    for (const itemLoadoutId of ["first", "second"]) {
      expect((await caller.updateCombatLoadout({ battleId: initial.id, itemLoadoutId })).success).toBe(true);
      const stored = (await client.query.battle.findFirst())!;
      const retained = stored.usersState.find((actor) => actor.petId === "owner-pet")!;
      expect(stored.usersState.find((actor) => actor.userId === "owner")).toMatchObject(originalLocation);
      expect(retained).toEqual(originalPet);
      expect(stored.usersEffects.filter((effect) => effect.creatorId === pet.userId)).toEqual(selfEffects);
      const rebuilt = stored.usersEffects.filter((effect) => effect.actionId === allies.id);
      expect(rebuilt).toHaveLength(6);
      expect(rebuilt.filter((effect) => effect.targetId === retained.userId)).toHaveLength(3);
      expect(rebuilt.every((effect) => stored.usersState.find((actor) => actor.userId === effect.targetId)?.direction === direction)).toBe(true);
      expect(retained.curHealth).toBe(getEffectiveMaxPool(retained, stored.usersEffects, "Health"));
    }
    await client.update(userSkill).set({ activated: false }).where(eq(userSkill.skillId, allies.id));
    expect((await caller.updateCombatLoadout({ battleId: initial.id, itemLoadoutId: "first" })).success).toBe(true);
    let stored = (await client.query.battle.findFirst())!;
    let retained = stored.usersState.find((actor) => actor.petId === "owner-pet")!;
    expect(stored.usersEffects.filter((effect) => effect.actionId === allies.id)).toHaveLength(0);
    expect(retained.curHealth).toBe(retained.maxHealth);
    expect(retained._prevHealthAdj).toBeUndefined();
    await client.update(userSkill).set({ activated: true }).where(eq(userSkill.skillId, allies.id));
    expect((await caller.updateCombatLoadout({ battleId: initial.id, itemLoadoutId: "second" })).success).toBe(true);
    stored = (await client.query.battle.findFirst())!;
    retained = stored.usersState.find((actor) => actor.petId === "owner-pet")!;
    expect(retained.curHealth).toBe(retained.maxHealth);
    expect(getEffectiveMaxPool(retained, stored.usersEffects, "Health")).toBeCloseTo(retained.maxHealth * 1.2);
    expect(retained._prevHealthAdj).toBeCloseTo(retained.maxHealth * 0.2);
  });
});
