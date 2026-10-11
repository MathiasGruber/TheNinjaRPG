import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { MAP_WAKE_ISLAND_SECTOR, PET_GENERATION_LEASE_MS, PET_GENERATION_RETRY_MS, PET_MAX_GENERATION_ATTEMPTS, PET_REPLACEMENT_COST } from "@/drizzle/constants";
import { userData, userPet, userUpload } from "@/drizzle/schema";
import * as appearance from "@/libs/pets/appearance";
import { PET_SPECIES } from "@/libs/pets/catalogue";
import { petExperienceGainSql } from "@/libs/pets/experience";
import { petsRouter } from "@/server/api/routers/pets";
import type { DrizzleClient } from "@/server/db";
import { DAY_S, getPetDayKey, secondsFromNow } from "@/utils/time";
import { insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import { callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const userId = "pet-owner";
const petId = "owned-pet";
const avatar = "https://example.com/accepted-pet.webp";
const stats = { offence: 10, defence: 0, strength: 0, speed: 0, intelligence: 0, willpower: 0 };

describeWithDatabase("Companion ownership, economy and generation", () => {
  beforeEach(async () => {
    await resetTables(userUpload, userPet, userData);
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
    expect((await caller.releasePet()).success).toBe(true);
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

  it("rejects tampered options, stale days and adoption away from Wake Island", async () => {
    const database = await getTestDatabase();
    const caller = callerForDatabase(petsRouter, userId, database);
    const view = await caller.getPet();
    const input = await adoptionInput(database);
    const unavailable = PET_SPECIES.find(({ index }) => !view.options.species.some((option) => option.index === index))!;
    expect((await caller.acquirePet({ ...input, speciesIndex: unavailable.index })).success).toBe(false);
    expect((await caller.acquirePet({ ...input, dayKey: "2000-01-01" })).success).toBe(false);
    await database.update(userData).set({ sector: 1 }).where(eq(userData.userId, userId));
    expect((await caller.acquirePet(input)).success).toBe(false);
    expect(await database.query.userPet.findMany()).toHaveLength(0);
    expect((await readOwner(database))?.petAcquisitions).toBe(0);
  });

  it("resets XP gained before release and excludes the released identity from later rewards", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petExperience: 15, petAcquisitions: 1 }).where(eq(userData.userId, userId));
    const hooked = beforeTransaction(database, async () => {
      await database.update(userData).set({ petExperience: petExperienceGainSql(25, petId) }).where(eq(userData.userId, userId));
    });
    expect((await callerForDatabase(petsRouter, userId, hooked).releasePet()).success).toBe(true);
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
    expect((await callerForDatabase(petsRouter, userId, hooked).releasePet()).success).toBe(false);
    expect((await readOwner(database))?.petExperience).toBe(50);
    expect(await database.query.userPet.findMany()).toHaveLength(1);
  });

  it("cannot allocate the same XP twice under concurrent requests", async () => {
    const database = await getTestDatabase();
    await readyPet(database);
    await database.update(userData).set({ petExperience: 10 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.assignExperience(stats), caller.assignExperience(stats)]);
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
    const hooked = beforeTransaction(database, async () => {
      await database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId));
    });
    expect((await callerForDatabase(petsRouter, userId, hooked).assignExperience(stats)).success).toBe(false);
    expect((await readOwner(database))?.petExperience).toBe(50);
    expect((await readPet(database))?.offence).toBe(10);
    expect((await readPet(database))?.experience).toBe(0);
  });

  it("uses allocated XP and owner rank for evolution and requires finished art before another", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { experience: 7500 });
    const caller = callerForDatabase(petsRouter, userId, database);
    await database.update(userData).set({ rank: "STUDENT", petExperience: 100000 }).where(eq(userData.userId, userId));
    expect((await caller.rankUp()).success).toBe(false);
    await database.update(userData).set({ rank: "GENIN" }).where(eq(userData.userId, userId));
    expect((await caller.rankUp()).success).toBe(true);
    expect((await readPet(database))?.rank).toBe(2);
    expect((await readPet(database))?.artRank).toBe(1);
    expect((await readPet(database))?.generationStatus).toBe("PENDING");
    expect((await caller.rankUp()).success).toBe(false);
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
    expect(await caller.rankUp()).toEqual({
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
    expect((await caller.rankUp()).success).toBe(true);
    expect(await readPet(database)).toMatchObject({
      rank: 4, artRank: 3, generationStatus: "PENDING", avatar,
      generationDay: previousDay, generationAttempts: PET_MAX_GENERATION_ATTEMPTS,
    });
  });

  it("preserves a downgraded owner's pet while preventing enable, training, AI edits and evolution", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { rank: 2, artRank: 2, battleEnabled: false });
    await database.update(userData).set({ rank: "STUDENT", petExperience: 100 }).where(eq(userData.userId, userId));
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.updatePet({ battleEnabled: true })).success).toBe(false);
    expect((await caller.assignExperience(stats)).success).toBe(false);
    expect((await caller.updateAiConfig({ rules: [], includeDefaultRules: true })).success).toBe(false);
    expect((await caller.rankUp()).success).toBe(false);
    expect((await caller.updatePet({ name: "StillMine", battleEnabled: false })).success).toBe(true);
    expect((await readPet(database))?.name).toBe("StillMine");
    expect((await caller.releasePet()).success).toBe(true);
  });

  it("keeps an adopted pet on provider failure and retries without charging again", async () => {
    const database = await getTestDatabase();
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.acquirePet(await adoptionInput(database))).success).toBe(true);
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockRejectedValueOnce(new Error("Provider unavailable"));
    expect((await caller.generateAppearance()).success).toBe(false);
    expect((await readPet(database))?.generationStatus).toBe("FAILED");
    expect((await readOwner(database))?.petAcquisitions).toBe(1);
    expect((await readOwner(database))?.reputationPoints).toBe(200);
    await database.update(userPet).set({ generationStartedAt: new Date(Date.now() - PET_GENERATION_RETRY_MS - 1000) }).where(eq(userPet.userId, userId));
    generate.mockImplementation(async (_pet, onUpload) => { await onUpload(avatar); return avatar; });
    expect((await caller.generateAppearance()).success).toBe(true);
    expect((await readPet(database))?.generationStatus).toBe("READY");
    expect((await readPet(database))?.generationAttempts).toBe(2);
    expect((await readOwner(database))?.reputationPoints).toBe(200);
    expect((await database.query.userUpload.findFirst())?.imageUrl).toBe(avatar);
    expect((await caller.generateAppearance()).success).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("lets only one generation claim reach the provider", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "PENDING", avatar: null, artRank: 0 });
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, holdOwnerSnapshots(database, 2));
    const results = await Promise.all([caller.generateAppearance(), caller.generateAppearance()]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await readPet(database))?.generationAttempts).toBe(1);
  });

  it("respects daily attempts and resets their count on the next UTC day", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "FAILED", artRank: 0, avatar: null, generationDay: getPetDayKey(), generationAttempts: PET_MAX_GENERATION_ATTEMPTS });
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.generateAppearance()).success).toBe(false);
    expect(generate).not.toHaveBeenCalled();
    await database.update(userPet).set({ generationDay: "2000-01-01" }).where(eq(userPet.id, petId));
    expect((await caller.generateAppearance()).success).toBe(true);
    expect((await readPet(database))?.generationAttempts).toBe(1);
  });

  it("recovers a stale lease without accepting the old token's completion", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "GENERATING", artRank: 0, avatar: null, generationToken: "abandoned-token", generationStartedAt: new Date(Date.now() - PET_GENERATION_LEASE_MS - 1000), generationAttempts: 1, generationDay: getPetDayKey() });
    vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.generateAppearance()).success).toBe(true);
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
    const result = await callerForDatabase(petsRouter, userId, database).generateAppearance();
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
    expect((await callerForDatabase(petsRouter, userId, database).generateAppearance()).success).toBe(false);
    expect((await readPet(database))?.generationStatus).toBe("GENERATING");
    expect((await readPet(database))?.generationToken).toBe("newer-token");
  });

  it("blocks release during an active lease but permits abandoned generation recovery", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "GENERATING", generationToken: "current", generationStartedAt: new Date() });
    const caller = callerForDatabase(petsRouter, userId, database);
    expect((await caller.releasePet()).success).toBe(false);
    await database.update(userPet).set({ generationStartedAt: new Date(Date.now() - PET_GENERATION_LEASE_MS - 1000) }).where(eq(userPet.id, petId));
    expect((await caller.releasePet()).success).toBe(true);
    expect(await database.query.userPet.findMany()).toHaveLength(0);
  });

  it("rejects generation if its pet snapshot changes before the provider claim", async () => {
    const database = await getTestDatabase();
    await readyPet(database, { generationStatus: "PENDING", artRank: 0, avatar: null });
    const generate = vi.spyOn(appearance, "generatePetAppearance").mockResolvedValue(avatar);
    const hooked = beforeStatements(database, userPet, [() => database.update(userPet).set({ revision: sql`${userPet.revision} + 1` }).where(eq(userPet.id, petId))]);
    expect((await callerForDatabase(petsRouter, userId, hooked).generateAppearance()).success).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});

const adoptionInput = async (database: DrizzleClient) => {
  const data = await callerForDatabase(petsRouter, userId, database).getPet();
  return { name: "Kumo", dayKey: data.dayKey, speciesIndex: data.options.species[0]!.index, paletteIndex: data.options.palettes[0]!.index, characteristicIndex: data.options.characteristics[0]!.index, auraIndex: data.options.auras[0]!.index };
};

const readyPet = async (database: DrizzleClient, overrides: Partial<typeof userPet.$inferInsert> = {}) => {
  await database.insert(userPet).values({ id: petId, userId, name: "Kumo", speciesIndex: 0, paletteIndex: 0, characteristicIndex: 0, auraIndex: 0, avatar, artRank: 1, generationStatus: "READY", ...overrides });
};
const readOwner = (database: DrizzleClient) => database.query.userData.findFirst({ where: eq(userData.userId, userId) });
const readPet = (database: DrizzleClient) => database.query.userPet.findFirst({ where: eq(userPet.userId, userId) });

/** Hold complete owner snapshots so both competing requests begin with the same entitlement. */
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
