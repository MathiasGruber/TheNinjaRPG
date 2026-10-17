import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { MAP_WAKE_ISLAND_SECTOR, PET_ABILITY_SLOT_COST, PET_COLLECTION_SLOT_COST, PET_FEED_EXPERIENCE_PER_RANK, PET_GENERATION_LEASE_MS, PET_GENERATION_RETRY_MS, PET_MAX_COLLECTION_SLOTS, PET_MAX_GENERATION_ATTEMPTS, PET_REPLACEMENT_COST } from "@/drizzle/constants";
import { item, jutsu, skillTree, userData, userItem, userJutsu, userPet, petSpecies, userSkill, userUpload } from "@/drizzle/schema";
import * as appearance from "@/libs/pets/appearance";
import { petExperienceGainSql } from "@/libs/pets/experience";
import { petsRouter } from "@/server/api/routers/pets";
import type { DrizzleClient } from "@/server/db";
import { DAY_S, getPetDayKey, secondsFromNow } from "@/utils/time";
import { initialPetSpecies } from "../../libs/pets/helpers/species";
import { petJutsuFixture, petSkillFixture } from "../../libs/pets/helpers/abilities";
import { insertItems, insertPetSpecies, insertUserItems, insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import { callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const userId = "pet-owner";
const petId = "owned-pet";
const avatar = "https://example.com/accepted-pet.webp";
const stats = { offence: 10, defence: 0, strength: 0, speed: 0, intelligence: 0, willpower: 0 };

describeWithDatabase("Companion ownership, economy and generation", () => {
  beforeEach(async () => {
    await resetTables(petSpecies, userUpload, userPet, userSkill, userJutsu, userItem, skillTree, jutsu, item, userData);
    await insertPetSpecies(initialPetSpecies);
    await insertUsers([{ userId, username: "PetOwner", rank: "GENIN", sector: MAP_WAKE_ISLAND_SECTOR, status: "AWAKE", reputationPoints: 200 }]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lets only one concurrent request claim the first free companion", async () => {
    const database = await getTestDatabase();
    const input = await adoptionInput(database);
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.acquirePet(input), caller.acquirePet(input)]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await database.query.userPet.findMany()).toHaveLength(1);
    const owner = await readOwner(database);
    expect(owner?.petAcquisitions).toBe(1);
    expect(owner?.reputationPoints).toBe(200);
  });

  it("requires release before replacement and atomically debits one replacement", async () => {
    const database = await getTestDatabase();
    const caller = callerForDatabase(petsRouter, userId, database);
    const input = await adoptionInput(database);
    expect((await caller.acquirePet(input)).success).toBe(true);
    expect((await caller.acquirePet(input)).success).toBe(false);
    const acquiredPet = await readPet(database);
    expect((await caller.releasePet({ petId: acquiredPet!.id })).success).toBe(true);
    const racing = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([racing.acquirePet(input), racing.acquirePet(input)]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const owner = await readOwner(database);
    expect(owner?.petAcquisitions).toBe(2);
    expect(owner?.reputationPoints).toBe(200 - PET_REPLACEMENT_COST);
  });

  it("does not create a replacement without its full guarded payment", async () => {
    const database = await getTestDatabase();
    await database.update(userData).set({ petAcquisitions: 1, reputationPoints: PET_REPLACEMENT_COST - 1 }).where(eq(userData.userId, userId));
    const input = await adoptionInput(database);
    expect((await callerForDatabase(petsRouter, userId, database).acquirePet(input)).success).toBe(false);
    expect(await database.query.userPet.findMany()).toHaveLength(0);
    expect((await readOwner(database))?.reputationPoints).toBe(PET_REPLACEMENT_COST - 1);
  });

  it("adopts newly authored species and retains their identity for generation after retirement", async () => {
    const database = await getTestDatabase();
    await database.update(petSpecies).set({ isActive: false });
    const species = { id: "authored-spirit-fox", name: "Spirit fox", description: "A fox with translucent ears", rarity: "RARE" as const, isActive: true };
    await insertPetSpecies([species]);
    const caller = callerForDatabase(petsRouter, userId, database);
    const input = await adoptionInput(database);
    expect(input.speciesId).toBe(species.id);
    expect((await caller.acquirePet(input)).success).toBe(true);
    const pet = (await readPet(database))!;
    expect(pet.speciesId).toBe(species.id);
    await database.update(petSpecies).set({ isActive: false }).where(eq(petSpecies.id, species.id));
    const view = await caller.getPet();
    expect(view.options.species).toEqual([]);
    expect(view.pet?.species).toMatchObject({ ...species, isActive: false });
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    expect((await caller.generateAppearance({ petId: pet.id })).success).toBe(true);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ species: expect.objectContaining({ id: species.id, description: species.description, isActive: false }) }), expect.any(Function));
  });

  it("rejects a species retired after today's menu was loaded without granting a pet or charging reputation", async () => {
    const database = await getTestDatabase();
    const input = await adoptionInput(database);
    await database.update(petSpecies).set({ isActive: false }).where(eq(petSpecies.id, input.speciesId));
    const before = await readOwner(database);
    expect((await callerForDatabase(petsRouter, userId, database).acquirePet(input)).success).toBe(false);
    expect(await database.query.userPet.findMany()).toEqual([]);
    expect(await readOwner(database)).toEqual(before);
  });

  it("rejects tampered options, stale days and adoption away from Wake Island", async () => {
    const database = await getTestDatabase();
    const caller = callerForDatabase(petsRouter, userId, database);
    const view = await caller.getPet();
    const input = await adoptionInput(database);
    const unavailable = initialPetSpecies.find(({ id }) => !view.options.species.some((option) => option.id === id))!;
    expect((await caller.acquirePet({ ...input, speciesId: unavailable.id })).success).toBe(false);
    expect((await caller.acquirePet({ ...input, dayKey: "2000-01-01" })).success).toBe(false);
    await database.update(userData).set({ sector: 1 }).where(eq(userData.userId, userId));
    expect((await caller.acquirePet(input)).success).toBe(false);
    expect(await database.query.userPet.findMany()).toHaveLength(0);
    expect((await readOwner(database))?.petAcquisitions).toBe(0);
  });

  it("enforces live capacity when parallel reads observe a fresh owner and stale collection", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petSlots: 2, petAcquisitions: 1 }).where(eq(userData.userId, userId));
    const stalePets = await database.query.userPet.findMany();
    const input = await adoptionInput(database);
    expect((await callerForDatabase(petsRouter, userId, database).acquirePet(input)).success).toBe(true);
    const petQueries = new Proxy(database.query.userPet, { get(target, property, receiver) {
      return property === "findMany" ? async () => stalePets : Reflect.get(target, property, receiver);
    } });
    const skewed = new Proxy(database, { get(target, property, receiver) {
      return property === "query" ? { ...target.query, userPet: petQueries } : Reflect.get(target, property, receiver);
    } });
    const before = await readOwner(database);
    expect((await callerForDatabase(petsRouter, userId, skewed).acquirePet(input)).success).toBe(false);
    expect(await database.query.userPet.findMany()).toHaveLength(2);
    expect(await readOwner(database)).toEqual(before);
  });

  it("charges once when concurrent slot purchases reach the collection limit", async () => {
    const database = await getTestDatabase();
    await database.update(userData).set({ petSlots: PET_MAX_COLLECTION_SLOTS - 1 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.unlockSlot(), caller.unlockSlot()]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await readOwner(database)).toMatchObject({ petSlots: PET_MAX_COLLECTION_SLOTS, reputationPoints: 200 - PET_COLLECTION_SLOT_COST });
    expect((await caller.unlockSlot()).success).toBe(false);
    expect((await readOwner(database))?.reputationPoints).toBe(200 - PET_COLLECTION_SLOT_COST);
    await database.update(userData).set({ petSlots: 1, reputationPoints: PET_COLLECTION_SLOT_COST - 1 }).where(eq(userData.userId, userId));
    expect((await caller.unlockSlot()).success).toBe(false);
    expect((await readOwner(database))?.petSlots).toBe(1);
  });

  it("adopts only one parked companion into the last free slot without moving active XP", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petSlots: 2, petAcquisitions: 1, petExperience: 75 }).where(eq(userData.userId, userId));
    const input = await adoptionInput(database);
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.acquirePet(input), caller.acquirePet(input)]);
    const acquired = results.find((result) => result.success)!;
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 75, petAcquisitions: 2, reputationPoints: 200 - PET_REPLACEMENT_COST });
    expect(await database.query.userPet.findMany()).toHaveLength(2);
    expect(await readPet(database, acquired.petId!)).toMatchObject({ generationStatus: "PENDING", storedExperience: 0, experience: 0 });
    expect((await caller.acquirePet(input)).success).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it("moves each XP bank with its companion, including XP earned immediately before the swap", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { id: "parked", storedExperience: 30 });
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const hooked = beforeStatements(database, userData, [async () => {
      await database.update(userData).set({ petExperience: petExperienceGainSql(25, petId) }).where(eq(userData.userId, userId));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).activatePet({ petId: "parked" })).success).toBe(true);
    expect(await readOwner(database)).toMatchObject({ activePetId: "parked", petExperience: 30 });
    expect(await readPet(database, petId)).toMatchObject({ storedExperience: 35 });
    expect(await readPet(database, "parked")).toMatchObject({ storedExperience: 0 });
    await database.update(userData).set({ petExperience: petExperienceGainSql(100, petId) }).where(eq(userData.userId, userId));
    expect((await readOwner(database))?.petExperience).toBe(30);
    await database.update(userData).set({ petExperience: petExperienceGainSql(7, "parked") }).where(eq(userData.userId, userId));
    expect((await callerForDatabase(petsRouter, userId, database).activatePet({ petId })).success).toBe(true);
    expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 35 });
    expect(await readPet(database, "parked")).toMatchObject({ storedExperience: 37 });
  });

  it("preserves all XP when two companions compete to become active", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { id: "second", storedExperience: 20 });
    await parkedPet(database, { id: "third", storedExperience: 30 });
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.activatePet({ petId: "second" }), caller.activatePet({ petId: "third" })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const owner = (await readOwner(database))!;
    const pets = await database.query.userPet.findMany();
    expect(owner.activePetId === "second" || owner.activePetId === "third").toBe(true);
    expect(pets.find((pet) => pet.id === owner.activePetId)?.storedExperience).toBe(0);
    expect(owner.petExperience + pets.reduce((total, pet) => total + pet.storedExperience, 0)).toBe(60);
  });

  it("rolls back both XP transfers if the selected companion changes before activation", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { id: "parked", storedExperience: 30 });
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const hooked = beforeStatements(database, userData, [async () => {
      await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, "parked"));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).activatePet({ petId: "parked" })).success).toBe(false);
    expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 10 });
    expect((await readPet(database, petId))?.storedExperience).toBe(0);
    expect((await readPet(database, "parked"))?.storedExperience).toBe(30);
  });

  it("keeps both XP banks unchanged when the previous companion changes before activation", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { storedExperience: 30 });
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const hooked = beforeStatements(database, userData, [async () => {
      await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).activatePet({ petId: "parked" })).success).toBe(false);
    expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 10 });
    expect(await readPet(database, petId)).toMatchObject({ storedExperience: 0, revision: 1 });
    expect(await readPet(database, "parked")).toMatchObject({ storedExperience: 30, revision: 0 });
  });

  it("refuses a swap when a skewed collection snapshot omits the active companion", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { storedExperience: 30 });
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const pets = await database.query.userPet.findMany({ where: eq(userPet.id, "parked") });
    const petQueries = new Proxy(database.query.userPet, { get(target, property, receiver) {
      return property === "findMany" ? async () => pets : Reflect.get(target, property, receiver);
    } });
    const skewed = new Proxy(database, { get(target, property, receiver) {
      return property === "query" ? { ...target.query, userPet: petQueries } : Reflect.get(target, property, receiver);
    } });
    expect((await callerForDatabase(petsRouter, userId, skewed).activatePet({ petId: "parked" })).success).toBe(false);
    expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 10 });
    expect(await readPet(database, "parked")).toMatchObject({ storedExperience: 30, revision: 0 });
  });

  it("activates a parked companion when no companion is currently selected", async () => {
    const database = await getTestDatabase();
    await parkedPet(database, { storedExperience: 30 });
    expect((await callerForDatabase(petsRouter, userId, database).activatePet({ petId: "parked" })).success).toBe(true);
    expect(await readOwner(database)).toMatchObject({ activePetId: "parked", petExperience: 30 });
    expect(await readPet(database, "parked")).toMatchObject({ storedExperience: 0, revision: 1 });
  });

  it("serializes allocation with swapping so XP is either spent or parked exactly once", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { id: "parked", storedExperience: 20 });
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.assignExperience({ ...stats, petId }), caller.activatePet({ petId: "parked" })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const owner = (await readOwner(database))!;
    const pets = await database.query.userPet.findMany();
    expect(owner.petExperience + pets.reduce((total, pet) => total + pet.storedExperience + pet.experience, 0)).toBe(30);
    expect((await readPet(database, petId))?.offence).toBe(results[0]!.success ? 20 : 10);
  });

  it("trains and releases parked companions without using the active companion's bank", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { id: "parked", storedExperience: 20 });
    await database.update(userData).set({ petExperience: 99 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.assignExperience({ ...stats, petId: "parked" })).success).toBe(true);
    expect(await readPet(database, "parked")).toMatchObject({ storedExperience: 10, experience: 10, offence: 20 });
    expect((await caller.assignExperience({ ...stats, offence: 11, petId: "parked" })).success).toBe(false);
    expect((await caller.releasePet({ petId: "parked" })).success).toBe(true);
    expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 99 });
    expect(await readPet(database, "parked")).toBeUndefined();
  });

  it("serializes inactive release against activation of the same companion", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { storedExperience: 30 });
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.releasePet({ petId: "parked" }), caller.activatePet({ petId: "parked" })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    if (results[0]!.success) {
      expect(await readPet(database, "parked")).toBeUndefined();
      expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 10 });
      expect((await readPet(database, petId))?.storedExperience).toBe(0);
    } else {
      expect(await readOwner(database)).toMatchObject({ activePetId: "parked", petExperience: 30 });
      expect((await readPet(database, "parked"))?.storedExperience).toBe(0);
      expect((await readPet(database, petId))?.storedExperience).toBe(10);
    }
  });

  it("preserves an inactive companion if its revision changes before release", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { storedExperience: 30 });
    const before = await readOwner(database);
    const hooked = beforeStatements(database, userData, [async () => {
      await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, "parked"));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).releasePet({ petId: "parked" })).success).toBe(false);
    expect(await readOwner(database)).toEqual(before);
    expect(await readPet(database, "parked")).toMatchObject({ storedExperience: 30, revision: 1 });
  });

  it("rejects foreign companion reads and mutations without spending or dispatching generation", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await insertUsers([{ userId: "other-owner", username: "OtherOwner" }]);
    await parkedPet(database, { id: "foreign", userId: "other-owner", generationStatus: "PENDING", artRank: 0, avatar: null, generationToken: "private" });
    await mealStack();
    const before = await readOwner(database);
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, database);
    const selection = { petId: "foreign" };
    const results = await Promise.all([
      caller.activatePet(selection), caller.releasePet(selection), caller.rankUp(selection),
      caller.unlockAbilitySlot(selection), caller.updateAbilities({ ...selection, jutsuIds: [], skillIds: [] }),
      caller.assignExperience({ ...selection, ...stats }), caller.updatePet({ ...selection, name: "Stolen" }),
      caller.updateAiConfig({ ...selection, rules: [], includeDefaultRules: true }),
      caller.feedPet({ ...selection, userItemId: "meal-stack", expectedQuantity: 2 }),
      caller.generateAppearance(selection),
    ]);
    expect(results.every((result) => !result.success)).toBe(true);
    expect((await caller.getPet(selection)).pet).toBeNull();
    expect((await caller.getCollection()).pets.map((pet) => pet.id)).toEqual([petId]);
    expect((await caller.getCollection()).pets[0]).not.toHaveProperty("generationToken");
    expect(await readOwner(database)).toEqual(before);
    expect((await database.query.userItem.findFirst())?.quantity).toBe(2);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([{ status: "BATTLE" as const, battleId: null }, { status: "AWAKE" as const, battleId: "frozen-battle" }])("blocks collection, build, XP and meal mutations during combat: %j", async (state) => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 4, artRank: 4, experience: 105000 });
    await parkedPet(database, { id: "parked" });
    await mealStack();
    const input = await adoptionInput(database);
    await database.update(userData).set({ rank: "ELDER", petSlots: 3, petExperience: 100, ...state }).where(eq(userData.userId, userId));
    const before = await readOwner(database);
    const caller = callerForDatabase(petsRouter, userId, database);
    const results = await Promise.all([
      caller.unlockSlot(), caller.acquirePet(input), caller.activatePet({ petId: "parked" }),
      caller.releasePet({ petId }), caller.rankUp({ petId }), caller.unlockAbilitySlot({ petId }),
      caller.updateAbilities({ petId, jutsuIds: [], skillIds: [] }), caller.assignExperience({ petId, ...stats }),
      caller.updatePet({ petId, battleEnabled: false }), caller.updateAiConfig({ petId, rules: [], includeDefaultRules: false }),
      caller.feedPet({ petId, userItemId: "meal-stack", expectedQuantity: 2 }),
    ]);
    expect(results.every((result) => !result.success)).toBe(true);
    expect(await readOwner(database)).toEqual(before);
    expect((await readPet(database, petId))?.revision).toBe(0);
    expect((await database.query.userItem.findFirst())?.quantity).toBe(2);
  });

  it("consumes one meal and grants one feeding reward under concurrent requests, then resets daily", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await mealStack();
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const input = { petId, userItemId: "meal-stack", expectedQuantity: 2 };
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.feedPet(input), caller.feedPet(input)]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await readOwner(database))?.petExperience).toBe(10 + PET_FEED_EXPERIENCE_PER_RANK);
    expect((await readPet(database))?.feedDay).toBe(getPetDayKey());
    expect((await database.query.userItem.findFirst())?.quantity).toBe(1);
    expect((await caller.feedPet({ ...input, expectedQuantity: 1 })).success).toBe(false);
    await database.update(userPet).set({ feedDay: getPetDayKey(secondsFromNow(-DAY_S)) }).where(eq(userPet.id, petId));
    expect((await caller.feedPet({ ...input, expectedQuantity: 1 })).success).toBe(true);
    expect(await database.query.userItem.findFirst()).toBeUndefined();
    expect((await readOwner(database))?.petExperience).toBe(10 + 2 * PET_FEED_EXPERIENCE_PER_RANK);
  });

  it("feeds a parked companion into its own bank, which follows it when activated", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await parkedPet(database, { id: "parked", rank: 2, artRank: 2, storedExperience: 11 });
    await mealStack();
    await database.update(userData).set({ petExperience: 99 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.feedPet({ petId: "parked", userItemId: "meal-stack", expectedQuantity: 2 })).success).toBe(true);
    expect(await readOwner(database)).toMatchObject({ activePetId: petId, petExperience: 99 });
    expect((await readPet(database, "parked"))?.storedExperience).toBe(11 + 2 * PET_FEED_EXPERIENCE_PER_RANK);
    expect((await caller.activatePet({ petId: "parked" })).success).toBe(true);
    expect((await readOwner(database))?.petExperience).toBe(11 + 2 * PET_FEED_EXPERIENCE_PER_RANK);
    expect((await readPet(database, petId))?.storedExperience).toBe(99);
  });

  it("keeps a committed feed successful when zero-stack cleanup fails", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await mealStack();
    await database.update(userItem).set({ quantity: 1 }).where(eq(userItem.id, "meal-stack"));
    const hooked = beforeStatements(database, userItem, [async () => {}, async () => {
      throw new Error("Meal cleanup failed");
    }]);
    const caller = callerForDatabase(petsRouter, userId, hooked);
    const input = { petId, userItemId: "meal-stack", expectedQuantity: 1 };
    expect((await caller.feedPet(input)).success).toBe(true);
    expect((await readOwner(database))?.petExperience).toBe(PET_FEED_EXPERIENCE_PER_RANK);
    expect((await readPet(database))?.feedDay).toBe(getPetDayKey());
    expect((await database.query.userItem.findFirst())?.quantity).toBe(0);
    expect((await caller.getPet()).feedMeals).toEqual([]);
    expect((await caller.feedPet(input)).success).toBe(false);
    await database.update(userPet).set({ feedDay: getPetDayKey(secondsFromNow(-DAY_S)) }).where(eq(userPet.id, petId));
    expect((await caller.feedPet(input)).success).toBe(false);
    expect((await readOwner(database))?.petExperience).toBe(PET_FEED_EXPERIENCE_PER_RANK);
  });

  it.each(["stack", "pet"] as const)("rolls back feeding's meal and XP if its %s snapshot changes", async (changed) => {
    const database = await getTestDatabase();
    await readyPet(database);
    await mealStack();
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const hooked = beforeStatements(database, userData, [async () => {
      if (changed === "stack")
        await database.update(userItem).set({ quantity: 1 }).where(eq(userItem.id, "meal-stack"));
      else
        await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).feedPet({ petId, userItemId: "meal-stack", expectedQuantity: 2 })).success).toBe(false);
    expect((await readOwner(database))?.petExperience).toBe(10);
    expect((await readPet(database))?.feedDay).toBeNull();
    expect((await database.query.userItem.findFirst())?.quantity).toBe(changed === "stack" ? 1 : 2);
  });

  it("requires an owned, carried, finished meal and accepted pet art before consuming anything", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await mealStack();
    await insertUsers([{ userId: "meal-owner", username: "MealOwner" }]);
    const caller = callerForDatabase(petsRouter, userId, database);
    const input = { petId, userItemId: "meal-stack", expectedQuantity: 2 };
    const unavailable = [
      { userId: "meal-owner" }, { storedAtHome: true }, { isInAuction: true },
      { equipped: "CHEST" as const }, { craftingFinishedAt: secondsFromNow(60) },
    ];
    for (const patch of unavailable) {
      await database.update(userItem).set({ userId, storedAtHome: false, isInAuction: false, equipped: "NONE", craftingFinishedAt: null, ...patch }).where(eq(userItem.id, "meal-stack"));
      expect((await caller.feedPet(input)).success).toBe(false);
    }
    await database.update(userItem).set({ craftingFinishedAt: null }).where(eq(userItem.id, "meal-stack"));
    await database.update(userPet).set({ generationStatus: "PENDING" }).where(eq(userPet.id, petId));
    expect((await caller.feedPet(input)).success).toBe(false);
    expect((await readOwner(database))?.petExperience).toBe(0);
    expect((await readPet(database))?.feedDay).toBeNull();
    expect((await database.query.userItem.findFirst())?.quantity).toBe(2);
  });

  it("charges one ability slot purchase at its rank limit and rejects insufficient funds", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 4, artRank: 4 });
    await database.update(userData).set({ rank: "CHUNIN", reputationPoints: 2 * PET_ABILITY_SLOT_COST }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.unlockAbilitySlot({ petId }), caller.unlockAbilitySlot({ petId })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await readPet(database))?.abilitySlots).toBe(2);
    expect((await readOwner(database))?.reputationPoints).toBe(PET_ABILITY_SLOT_COST);
    expect((await caller.unlockAbilitySlot({ petId })).success).toBe(false);
    await database.update(userPet).set({ abilitySlots: 1 }).where(eq(userPet.id, petId));
    await database.update(userData).set({ reputationPoints: PET_ABILITY_SLOT_COST - 1 }).where(eq(userData.userId, userId));
    expect((await caller.unlockAbilitySlot({ petId })).success).toBe(false);
    expect((await readPet(database))?.abilitySlots).toBe(1);
    expect((await readOwner(database))?.reputationPoints).toBe(PET_ABILITY_SLOT_COST - 1);
  });

  it("rolls back the ability-slot payment when the companion changes before purchase", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 4, artRank: 4 });
    await database.update(userData).set({ rank: "CHUNIN" }).where(eq(userData.userId, userId));
    const hooked = beforeStatements(database, userData, [async () => {
      await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).unlockAbilitySlot({ petId })).success).toBe(false);
    expect((await readPet(database))?.abilitySlots).toBe(1);
    expect((await readOwner(database))?.reputationPoints).toBe(200);
  });

  it("rejects a paid pet change if the owner enters battle before the joined write", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 4, artRank: 4 });
    await database.update(userData).set({ rank: "CHUNIN" }).where(eq(userData.userId, userId));
    const hooked = beforeStatements(database, userData, [async () => {
      await database.update(userData).set({ status: "BATTLE", battleId: "new-battle" }).where(eq(userData.userId, userId));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).unlockAbilitySlot({ petId })).success).toBe(false);
    expect(await readPet(database)).toMatchObject({ abilitySlots: 1, revision: 0 });
    expect((await readOwner(database))?.reputationPoints).toBe(200);
  });

  it("uses single statements for routine pet writes and preserves JSON patches", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 4, artRank: 4 });
    await parkedPet(database, { storedExperience: 30, experience: 7500 });
    await mealStack();
    await database.update(userData).set({ rank: "CHUNIN", petExperience: 20 }).where(eq(userData.userId, userId));
    const withoutTransactions = new Proxy(database, { get(target, property, receiver) {
      if (property === "transaction") return () => { throw new Error("Routine pet writes must not use a transaction"); };
      return Reflect.get(target, property, receiver);
    } });
    const caller = callerForDatabase(petsRouter, userId, withoutTransactions);
    const rules = [{ conditions: [], action: { type: "end_turn" as const, description: 'Wait for "Kumo"' } }];
    expect((await caller.updatePet({ petId, name: 'Kumo "守"', battleEnabled: false, spawnPosition: "LEFT" })).success).toBe(true);
    expect((await caller.updateAiConfig({ petId, rules, includeDefaultRules: false })).success).toBe(true);
    expect((await caller.updateAbilities({ petId, jutsuIds: [], skillIds: [] })).success).toBe(true);
    expect((await caller.unlockAbilitySlot({ petId })).success).toBe(true);
    expect((await caller.assignExperience({ petId, ...stats })).success).toBe(true);
    expect((await caller.feedPet({ petId, userItemId: "meal-stack", expectedQuantity: 2 })).success).toBe(true);
    expect(await readPet(database, petId)).toMatchObject({ name: 'Kumo "守"', battleEnabled: false, spawnPosition: "LEFT", aiRules: rules, includeDefaultRules: false, jutsuIds: [], skillIds: [], abilitySlots: 2, offence: 20 });
    expect((await caller.activatePet({ petId: "parked" })).success).toBe(true);
    expect((await caller.rankUp({ petId: "parked" })).success).toBe(true);
    expect(await readPet(database, "parked")).toMatchObject({ rank: 2, generationStatus: "PENDING", generationToken: null, generationStartedAt: null });
    expect((await caller.releasePet({ petId })).success).toBe(true);
    expect((await readOwner(database))?.reputationPoints).toBe(200 - PET_ABILITY_SLOT_COST);
  });

  it("keeps settings and evolution free when no reputation remains", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { experience: 7500 });
    await database.update(userData).set({ reputationPoints: 0 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.updatePet({ petId, name: "Still free" })).success).toBe(true);
    expect((await caller.updateAiConfig({ petId, rules: [], includeDefaultRules: false })).success).toBe(true);
    expect((await caller.updateAbilities({ petId, jutsuIds: [], skillIds: [] })).success).toBe(true);
    expect((await caller.rankUp({ petId })).success).toBe(true);
    expect(await readPet(database)).toMatchObject({ name: "Still free", rank: 2, includeDefaultRules: false });
    expect((await readOwner(database))?.reputationPoints).toBe(0);
  });

  it("equips only learned jutsus and activated owned skills within purchased slots and the shared budget", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 4, artRank: 4, experience: 100000, abilitySlots: 2 });
    await database.update(userData).set({ rank: "CHUNIN" }).where(eq(userData.userId, userId));
    await insertUsers([{ userId: "ability-owner", username: "AbilityOwner" }]);
    await database.insert(jutsu).values([
      petJutsuFixture(), petJutsuFixture({ id: "foreign-strike", name: "Foreign Strike" }),
      petJutsuFixture({ id: "expensive-strike", name: "Expensive Strike", jutsuRank: "S" }),
    ]);
    await database.insert(skillTree).values([
      petSkillFixture(), petSkillFixture({ id: "inactive-skill", name: "Inactive Skill" }),
    ]);
    await database.insert(userJutsu).values([
      { id: "learned-strike", userId, jutsuId: "pet-strike" },
      { id: "learned-expensive", userId, jutsuId: "expensive-strike" },
      { id: "foreign-owned", userId: "ability-owner", jutsuId: "foreign-strike" },
    ]);
    await database.insert(userSkill).values([
      { id: "owned-skill", userId, skillId: "pet-muscle" },
      { id: "inactive-owned", userId, skillId: "inactive-skill", activated: false },
    ]);
    const caller = callerForDatabase(petsRouter, userId, database);
    const valid = { petId, jutsuIds: ["pet-strike"], skillIds: ["pet-muscle"] };
    expect((await caller.updateAbilities(valid)).success).toBe(true);
    for (const loadout of [
      { ...valid, jutsuIds: ["foreign-strike"] },
      { ...valid, skillIds: ["inactive-skill"] },
      { ...valid, jutsuIds: ["expensive-strike"] },
      { ...valid, jutsuIds: ["pet-strike", "pet-strike"], skillIds: [] },
    ]) expect((await caller.updateAbilities(loadout)).success).toBe(false);
    await database.update(userSkill).set({ activated: false }).where(eq(userSkill.id, "owned-skill"));
    expect((await caller.updateAbilities(valid)).success).toBe(false);
    expect(await readPet(database)).toMatchObject({ jutsuIds: valid.jutsuIds, skillIds: valid.skillIds });
    expect((await readOwner(database))?.reputationPoints).toBe(200);
    expect(await database.query.userJutsu.findMany()).toHaveLength(3);
    expect(await database.query.userSkill.findMany()).toHaveLength(2);
  });

  it("resets XP gained before release and excludes the released identity from later rewards", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petExperience: 15, petAcquisitions: 1 }).where(eq(userData.userId, userId));
    const hooked = beforeTransaction(database, async () => {
      await database.update(userData).set({ petExperience: petExperienceGainSql(25, petId) }).where(eq(userData.userId, userId));
    });
    expect((await callerForDatabase(petsRouter, userId, hooked).releasePet({ petId })).success).toBe(true);
    expect((await readOwner(database))?.petExperience).toBe(0);
    await database.update(userData).set({ petExperience: petExperienceGainSql(100, petId) }).where(eq(userData.userId, userId));
    expect((await readOwner(database))?.petExperience).toBe(0);
    expect((await readOwner(database))?.petAcquisitions).toBe(1);
  });

  it("rolls back XP reset when release loses its pet snapshot", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petExperience: 50 }).where(eq(userData.userId, userId));
    const hooked = beforeTransaction(database, async () => {
      await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
    });
    expect((await callerForDatabase(petsRouter, userId, hooked).releasePet({ petId })).success).toBe(false);
    expect((await readOwner(database))?.petExperience).toBe(50);
    expect(await database.query.userPet.findMany()).toHaveLength(1);
  });

  it("cannot allocate the same XP twice under concurrent requests", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.assignExperience({ ...stats, petId }), caller.assignExperience({ ...stats, petId })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await readOwner(database))?.petExperience).toBe(0);
    const pet = await readPet(database);
    expect(pet?.offence).toBe(20);
    expect(pet?.experience).toBe(10);
  });

  it("rolls back the XP debit when allocation loses its pet snapshot", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petExperience: 50 }).where(eq(userData.userId, userId));
    const hooked = beforeStatements(database, userData, [async () => {
      await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
    }]);
    expect((await callerForDatabase(petsRouter, userId, hooked).assignExperience({ ...stats, petId })).success).toBe(false);
    expect((await readOwner(database))?.petExperience).toBe(50);
    expect((await readPet(database))?.offence).toBe(10);
    expect((await readPet(database))?.experience).toBe(0);
  });

  it("uses allocated XP and owner rank for evolution and requires finished art before another", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { experience: 7500 });
    const caller = callerForDatabase(petsRouter, userId, database);
    await database.update(userData).set({ rank: "STUDENT", petExperience: 100000 }).where(eq(userData.userId, userId));
    expect((await caller.rankUp({ petId })).success).toBe(false);
    await database.update(userData).set({ rank: "GENIN" }).where(eq(userData.userId, userId));
    expect((await caller.rankUp({ petId })).success).toBe(true);
    expect((await readPet(database))?.rank).toBe(2);
    expect((await readPet(database))?.artRank).toBe(1);
    expect((await readPet(database))?.generationStatus).toBe("PENDING");
    expect((await caller.rankUp({ petId })).success).toBe(false);
  });

  it("keeps a ready pet unchanged when today's image attempts are exhausted", async () => {
    const database = await getTestDatabase();
    await readyPet(database, {
      rank: 3, artRank: 3, experience: 60000,
      generationDay: getPetDayKey(), generationAttempts: PET_MAX_GENERATION_ATTEMPTS,
    });
    await database.update(userData).set({ rank: "CHUNIN" }).where(eq(userData.userId, userId));
    const beforePet = await readPet(database);
    const beforeOwner = await readOwner(database);
    const caller = callerForDatabase(petsRouter, userId, database);
    expect(await caller.rankUp({ petId })).toEqual({
      success: false,
      message: `You have used today's ${PET_MAX_GENERATION_ATTEMPTS} generation attempts. Retry tomorrow; your companion is still yours.`,
    });
    expect(await readPet(database)).toEqual(beforePet);
    expect(await readOwner(database)).toEqual(beforeOwner);
  });

  it("allows evolution when exhausted image attempts belong to the previous UTC day", async () => {
    const database = await getTestDatabase();
    const previousDay = getPetDayKey(secondsFromNow(-DAY_S));
    await readyPet(database, {
      rank: 3, artRank: 3, experience: 60000,
      generationDay: previousDay, generationAttempts: PET_MAX_GENERATION_ATTEMPTS,
    });
    await database.update(userData).set({ rank: "CHUNIN" }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.rankUp({ petId })).success).toBe(true);
    expect(await readPet(database)).toMatchObject({
      rank: 4, artRank: 3, generationStatus: "PENDING", avatar,
      generationDay: previousDay, generationAttempts: PET_MAX_GENERATION_ATTEMPTS,
    });
  });

  it.each([false, true])("rejects enabling combat without changing a companion's saved %s preference or other settings", async (battleEnabled) => {
    const database = await getTestDatabase();
    await readyPet(database, { battleEnabled });
    const original = await readPet(database);
    const caller = callerForDatabase(petsRouter, userId, database);
    expect(await caller.updatePet({ petId, battleEnabled: true, name: "Rejected" })).toMatchObject({
      success: false, message: "Companion battles are not available yet.",
    });
    expect(await readPet(database)).toEqual(original);
    expect((await caller.updatePet({ petId, battleEnabled: false, name: "Still configurable" })).success).toBe(true);
    expect(await readPet(database)).toMatchObject({ battleEnabled: false, name: "Still configurable" });
  });

  it("preserves a downgraded owner's pet while preventing enable, training, AI edits and evolution", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 2, artRank: 2, battleEnabled: false });
    await database.update(userData).set({ rank: "STUDENT", petExperience: 100 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.updatePet({ petId, battleEnabled: true })).success).toBe(false);
    expect((await caller.assignExperience({ ...stats, petId })).success).toBe(false);
    expect((await caller.updateAiConfig({ petId, rules: [], includeDefaultRules: true })).success).toBe(false);
    expect((await caller.rankUp({ petId })).success).toBe(false);
    expect((await caller.updatePet({ petId, name: "StillMine", battleEnabled: false })).success).toBe(true);
    expect((await readPet(database))?.name).toBe("StillMine");
    expect((await caller.releasePet({ petId })).success).toBe(true);
  });

  it("keeps an adopted pet on provider failure and retries without charging again", async () => {
    const database = await getTestDatabase();
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.acquirePet(await adoptionInput(database))).success).toBe(true);
    const petId = (await readPet(database))!.id;
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockRejectedValueOnce(new Error("Provider unavailable"));
    expect((await caller.generateAppearance({ petId })).success).toBe(false);
    expect((await readPet(database))?.generationStatus).toBe("FAILED");
    expect((await readOwner(database))?.petAcquisitions).toBe(1);
    expect((await readOwner(database))?.reputationPoints).toBe(200);
    await database.update(userPet).set({ generationStartedAt: new Date(Date.now() - PET_GENERATION_RETRY_MS - 1000) }).where(eq(userPet.userId, userId));
    generate.mockImplementation(async (_pet, onUpload) => { await onUpload(avatar); return avatar; });
    expect((await caller.generateAppearance({ petId })).success).toBe(true);
    expect((await readPet(database))?.generationStatus).toBe("READY");
    expect((await readPet(database))?.generationAttempts).toBe(2);
    expect((await readOwner(database))?.reputationPoints).toBe(200);
    expect((await database.query.userUpload.findFirst())?.imageUrl).toBe(avatar);
    expect((await caller.generateAppearance({ petId })).success).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("lets only one generation claim reach the provider", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "PENDING", avatar: null, artRank: 0 });
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.generateAppearance({ petId }), caller.generateAppearance({ petId })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await readPet(database))?.generationAttempts).toBe(1);
  });

  it("respects daily attempts and resets their count on the next UTC day", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "FAILED", artRank: 0, avatar: null, generationDay: getPetDayKey(), generationAttempts: PET_MAX_GENERATION_ATTEMPTS });
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.generateAppearance({ petId })).success).toBe(false);
    expect(generate).not.toHaveBeenCalled();
    await database.update(userPet).set({ generationDay: "2000-01-01" }).where(eq(userPet.id, petId));
    expect((await caller.generateAppearance({ petId })).success).toBe(true);
    expect((await readPet(database))?.generationAttempts).toBe(1);
  });

  it("recovers a stale lease without accepting the old token's completion", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "GENERATING", artRank: 0, avatar: null, generationToken: "abandoned-token", generationStartedAt: new Date(Date.now() - PET_GENERATION_LEASE_MS - 1000), generationAttempts: 1, generationDay: getPetDayKey() });
    vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.generateAppearance({ petId })).success).toBe(true);
    expect((await readPet(database))?.generationToken).toBeNull();
    expect((await readPet(database))?.generationAttempts).toBe(2);
    expect((await caller.getPet()).pet).not.toHaveProperty("generationToken");
  });

  it("does not let an old generation overwrite a replacement identity or new lease", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "PENDING", artRank: 0, avatar: null });
    vi.spyOn(appearance, "generatePetAppearance").mockImplementation(async () => {
      await database.update(userPet).set({ generationToken: "newer-token", avatar: "/newer.webp", revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
      return avatar;
    });
    const result = await callerForDatabase(petsRouter, userId, database).generateAppearance({ petId });
    expect(result.success).toBe(false);
    expect((await readPet(database))?.avatar).toBe("/newer.webp");
    expect((await readPet(database))?.generationToken).toBe("newer-token");
  });

  it("does not let an old provider failure stamp a newer generation failed", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "PENDING", artRank: 0, avatar: null });
    vi.spyOn(appearance, "generatePetAppearance").mockImplementation(async () => {
      await database.update(userPet).set({ generationToken: "newer-token", revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
      throw new Error("Old provider failed after lease replacement");
    });
    expect((await callerForDatabase(petsRouter, userId, database).generateAppearance({ petId })).success).toBe(false);
    expect((await readPet(database))?.generationStatus).toBe("GENERATING");
    expect((await readPet(database))?.generationToken).toBe("newer-token");
  });

  it("blocks release during an active lease but permits abandoned generation recovery", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "GENERATING", generationToken: "current", generationStartedAt: new Date() });
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.releasePet({ petId })).success).toBe(false);
    await database.update(userPet).set({ generationStartedAt: new Date(Date.now() - PET_GENERATION_LEASE_MS - 1000) }).where(eq(userPet.id, petId));
    expect((await caller.releasePet({ petId })).success).toBe(true);
    expect(await database.query.userPet.findMany()).toHaveLength(0);
  });

  it("rejects generation if its pet snapshot changes before the provider claim", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "PENDING", artRank: 0, avatar: null });
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const hooked = beforeStatements(database, userPet, [() => database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId))]);
    expect((await callerForDatabase(petsRouter, userId, hooked).generateAppearance({ petId })).success).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});

const adoptionInput = async (database: DrizzleClient) => {
  const data = await callerForDatabase(petsRouter, userId, database).getPet();
  return { name: "Kumo", dayKey: data.dayKey, speciesId: data.options.species[0]!.id, paletteIndex: data.options.palettes[0]!.index, characteristicIndex: data.options.characteristics[0]!.index, auraIndex: data.options.auras[0]!.index };
};

const readyPet = async (database: DrizzleClient, overrides: Partial<typeof userPet.$inferInsert> = {}) => {
  await database.update(userData).set({ activePetId: overrides.id ?? petId }).where(eq(userData.userId, userId));
  await database.insert(userPet).values({ id: petId, userId, name: "Kumo", speciesId: "pet-species-0", paletteIndex: 0, characteristicIndex: 0, auraIndex: 0, avatar, artRank: 1, generationStatus: "READY", ...overrides });
};
const parkedPet = (database: DrizzleClient, overrides: Partial<typeof userPet.$inferInsert> = {}) =>
  database.insert(userPet).values({ id: "parked", userId, name: "Haru", speciesId: "pet-species-0", paletteIndex: 0, characteristicIndex: 0, auraIndex: 0, avatar, artRank: 1, generationStatus: "READY", ...overrides });

const mealStack = async () => {
  await insertItems([{ id: "pet-meal", name: "Companion Meal", itemType: "MEAL" }]);
  await insertUserItems([{ id: "meal-stack", itemId: "pet-meal", userId, quantity: 2 }]);
};
const readOwner = (database: DrizzleClient) => database.query.userData.findFirst({ where: eq(userData.userId, userId) });
const readPet = (database: DrizzleClient, id?: string) => database.query.userPet.findFirst({ where: and(eq(userPet.userId, userId), id ? eq(userPet.id, id) : undefined) });

/** Hold owner snapshots so competing requests share the same version before their SQL writes race. */
const holdOwnerSnapshots = (database: DrizzleClient, count: number): DrizzleClient => {
  let pending = 0;
  let release = () => {};
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const ownerQueries = new Proxy(database.query.userData, {
    get(target, property, receiver) {
      if (property !== "findFirst") return Reflect.get(target, property, receiver);
      return async (...args: Parameters<typeof target.findFirst>) => {
        const result = await target.findFirst(...args);
        pending += 1;
        if (pending >= count) release();
        await barrier;
        return result;
      };
    },
  });
  return new Proxy(database, { get(target, property, receiver) { return property === "query" ? { ...target.query, userData: ownerQueries } : Reflect.get(target, property, receiver); } });
};

/** Inject a state change after preloading but before adoption or active release starts its paired writes. */
const beforeTransaction = (database: DrizzleClient, hook: () => Promise<void>): DrizzleClient => {
  let pending = true;
  return new Proxy(database, { get(target, property, receiver) {
    if (property !== "transaction") return Reflect.get(target, property, receiver);
    return async (...args: Parameters<typeof target.transaction>) => {
      if (pending) { pending = false; await hook(); }
      return target.transaction(...args);
    };
  } });
};
