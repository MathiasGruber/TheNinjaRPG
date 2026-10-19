import { afterEach, describe, expect, it, vi } from "bun:test";
import { Moderations } from "openai/resources/moderations";
import { PET_OPTION_COUNTS, PET_RANKS } from "@/drizzle/constants";
import { classifyNsfwImage } from "@/libs/moderator";
import { getPetAppearancePrompt } from "@/libs/pets/appearance";
import { getDailyPetOptions, isAvailablePetAppearance, PET_AURAS, PET_CHARACTERISTICS, PET_PALETTES } from "@/libs/pets/catalogue";
import { canUsePet, getMaxPetRank, getPetLevel, petRankUpBlockMessage } from "@/libs/pets/progression";
import { calcLevelRequirements } from "@/libs/profile";
import { getPetDayKey } from "@/utils/time";
import { acquirePetSchema, assignPetExperienceSchema, petNameSchema, updatePetAiSchema } from "@/validators/pets";
import { initialPetSpecies } from "./pets/helpers/species";

afterEach(() => vi.restoreAllMocks());

describe("companion appearance choices", () => {
  it("offers stable subscriber supersets from an explicit species catalogue", () => {
    expect([initialPetSpecies.length, PET_PALETTES.length, PET_CHARACTERISTICS.length, PET_AURAS.length]).toEqual([67, 32, 16, 8]);
    for (const catalogue of [initialPetSpecies, PET_PALETTES, PET_CHARACTERISTICS, PET_AURAS])
      expect(new Set(catalogue.map(({ name }) => name)).size).toBe(catalogue.length);
    const normal = getDailyPetOptions("one-player", "NONE", initialPetSpecies, "2026-10-11");
    for (const status of ["NONE", "NORMAL", "SILVER", "GOLD"] as const) {
      const choices = getDailyPetOptions("one-player", status, initialPetSpecies, "2026-10-11");
      expect(choices).toEqual(getDailyPetOptions("one-player", status, initialPetSpecies, "2026-10-11"));
      for (const key of ["species", "palettes", "characteristics", "auras"] as const) {
        expect(choices[key]).toHaveLength(PET_OPTION_COUNTS[status]);
        expect(choices[key].slice(0, 3)).toEqual(normal[key]);
        expect(new Set(choices[key].map((option) => "id" in option ? option.id : option.index)).size).toBe(choices[key].length);
      }
    }
    const tiers = ["NONE", "NORMAL", "SILVER", "GOLD"] as const;
    for (let index = 1; index < tiers.length; index++) {
      const previous = getDailyPetOptions("one-player", tiers[index - 1]!, initialPetSpecies, "2026-10-11");
      const current = getDailyPetOptions("one-player", tiers[index]!, initialPetSpecies, "2026-10-11");
      expect(current.species.slice(0, previous.species.length)).toEqual(previous.species);
    }
    expect(getDailyPetOptions("another-player", "NONE", initialPetSpecies, "2026-10-11")).not.toEqual(normal);
    expect(getDailyPetOptions("one-player", "NONE", initialPetSpecies, "2026-10-12")).not.toEqual(normal);
  });

  it("uses UTC days and rejects an unavailable trait", () => {
    expect(getPetDayKey(new Date("2026-10-11T23:30:00-05:00"))).toBe("2026-10-12");
    const choices = getDailyPetOptions("player", "NONE", initialPetSpecies, "2026-10-11");
    const selection = { speciesId: choices.species[0]!.id, paletteIndex: choices.palettes[0]!.index, characteristicIndex: choices.characteristics[0]!.index, auraIndex: choices.auras[0]!.index };
    expect(isAvailablePetAppearance(selection, choices)).toBe(true);
    const unavailable = initialPetSpecies.find(({ id }) => !choices.species.some((option) => option.id === id))!;
    expect(isAvailablePetAppearance({ ...selection, speciesId: unavailable.id }, choices)).toBe(false);
    expect(acquirePetSchema.safeParse({ name: "Kumo", dayKey: "2026-10-11", ...selection, auraIndex: 8 }).success).toBe(false);
  });

  it("removes claimed species without rolling replacements or changing other daily traits", () => {
    const dayKey = "2026-10-18";
    const original = getDailyPetOptions("player", "GOLD", initialPetSpecies, dayKey);
    const speciesIds = [original.species[0]!.id, original.species[3]!.id];
    const remaining = getDailyPetOptions("player", "GOLD", initialPetSpecies, dayKey, { dayKey, speciesIds });
    expect(remaining).toEqual({ ...original, species: original.species.filter(({ id }) => !speciesIds.includes(id)) });
    expect(getDailyPetOptions("player", "GOLD", initialPetSpecies, dayKey, { dayKey: "2026-10-17", speciesIds })).toEqual(original);
  });

  it("restricts names and stat allocations without accepting free-form art prompts", () => {
    expect(petNameSchema.parse("  Kumo  ")).toBe("Kumo");
    expect(petNameSchema.safeParse("Kumo\u202e").success).toBe(false);
    expect(petNameSchema.safeParse("Kumo\n").success).toBe(true);
    expect(petNameSchema.safeParse("Ku\nmo").success).toBe(false);
    expect(assignPetExperienceSchema.safeParse({ offence: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(assignPetExperienceSchema.safeParse({ strength: -1 }).success).toBe(false);
  });
});

describe("companion progression", () => {
  const ready = { rank: 1, experience: 7500, generationStatus: "READY" as const, generationStartedAt: null, artRank: 1, avatar: "/accepted-pet.webp", battleEnabled: true };

  it("enforces the exact owner rank hierarchy and accepted current art", () => {
    expect(["STUDENT", "GENIN", "CHUNIN", "JONIN", "ELITE JONIN", "ELDER", "NONE"].map((rank) => getMaxPetRank(rank as Parameters<typeof getMaxPetRank>[0]))).toEqual([1, 3, 5, 7, 10, 7, 0]);
    expect(PET_RANKS.some((entry) => (entry.minUserRank as string) === "ELDER")).toBe(false);
    expect(PET_RANKS.at(-1)?.minUserRank).toBe("ELITE JONIN");
    expect(petRankUpBlockMessage({ ...ready, rank: 7, artRank: 7, experience: 637500 }, { rank: "ELDER" })).toContain("ELITE JONIN");
    expect(petRankUpBlockMessage({ ...ready, rank: 9, artRank: 9, experience: 1620000 }, { rank: "ELITE JONIN" })).toBeNull();
    expect(canUsePet(ready, { rank: "STUDENT" })).toBe(true);
    expect(canUsePet({ ...ready, rank: 2, artRank: 2 }, { rank: "STUDENT" })).toBe(false);
    expect(canUsePet({ ...ready, generationStatus: "GENERATING" }, { rank: "GENIN" })).toBe(true);
    expect(canUsePet({ ...ready, generationStatus: "GENERATING", artRank: 0 }, { rank: "GENIN" })).toBe(false);
    expect(canUsePet({ ...ready, artRank: 0 }, { rank: "GENIN" })).toBe(false);
    expect(canUsePet({ ...ready, battleEnabled: false }, { rank: "GENIN" })).toBe(false);
    expect(canUsePet({ ...ready, avatar: null }, { rank: "GENIN" })).toBe(false);
  });

  it("shares the level curve and requires a finished form before another rank", () => {
    expect(getPetLevel({ rank: 1, experience: 0 })).toBe(1);
    expect(getPetLevel({ rank: 1, experience: calcLevelRequirements(1) })).toBe(2);
    expect(getPetLevel({ rank: 1, experience: 1_000_000 })).toBe(5);
    for (let index = 1; index < PET_RANKS.length; index++)
      expect(Number(PET_RANKS[index]!.experienceRequired)).toBe(calcLevelRequirements(PET_RANKS[index - 1]!.levelCap));
    expect(petRankUpBlockMessage(ready, { rank: "STUDENT" })).toContain("GENIN");
    expect(petRankUpBlockMessage(ready, { rank: "GENIN" })).toBeNull();
    expect(petRankUpBlockMessage({ ...ready, experience: 7499 }, { rank: "GENIN" })).toContain("experience");
    expect(petRankUpBlockMessage({ ...ready, artRank: 0 }, { rank: "GENIN" })).toContain("appearance");
    expect(petRankUpBlockMessage({ ...ready, generationStatus: "GENERATING", generationStartedAt: new Date() }, { rank: "GENIN" })).toContain("appearance");
  });
});

describe("companion image safety and AI controls", () => {
  it("uses authored rank-specific growth and reference preservation prompts", () => {
    const base = { userId: "player", speciesId: "pet-species-0", species: initialPetSpecies[0]!, paletteIndex: 0, characteristicIndex: 0, auraIndex: 0, rank: 1, artRank: 0, avatar: null };
    const founder = getPetAppearancePrompt(base);
    expect(founder.startsWith(`Full-body ${base.species.name} companion`)).toBe(true);
    expect(founder).toContain("natural adult proportions");
    const rankedPrompts = PET_RANKS.map(({ rank, name }) => {
      const prompt = getPetAppearancePrompt({ ...base, rank, artRank: rank - 1, avatar: "/previous.webp" });
      expect(prompt).toContain(`Evolution rank ${rank} of 10 (${name})`);
      expect(prompt).toContain(base.species.description);
      return prompt;
    });
    expect(new Set(rankedPrompts).size).toBe(10);
    const evolution = getPetAppearancePrompt({ ...base, rank: 2, artRank: 1, avatar: "/previous.webp" });
    expect(evolution).toContain("next evolution");
    expect(evolution).toContain("SAME individual animal");
    const restyle = getPetAppearancePrompt({ ...base, rank: 2, artRank: 2, avatar: "/previous.webp" });
    expect(restyle).toContain("Do not evolve it, rank it up or age it");
    expect(restyle).toContain("Evolution rank 2 of 10");
    expect(restyle).not.toContain("next evolution");
    expect(() => getPetAppearancePrompt({ ...base, species: null })).toThrow("Invalid pet appearance");
    const retiredSpecies = { ...initialPetSpecies[0]!, name: "Spirit fox", description: "A fox with translucent ears", isActive: false };
    expect(getPetAppearancePrompt({ ...base, species: retiredSpecies })).toContain(retiredSpecies.description);
  });

  it("fails closed when strict image moderation returns no result", async () => {
    vi.spyOn(Moderations.prototype, "create").mockImplementation(() => Promise.resolve({ results: [] }) as never);
    await expect(classifyNsfwImage("https://example.com/pet.webp", true)).rejects.toThrow("did not return a result");
  });

  it("only accepts AI actions and effects supplied by the pet's basic loadout", () => {
    const config = { petId: "owned-pet", includeDefaultRules: true, rules: [{ conditions: [], action: { type: "use_highest_power_action", effect: "damage" } }] };
    expect(updatePetAiSchema.safeParse(config).success).toBe(true);
    expect(updatePetAiSchema.safeParse({ ...config, rules: [{ conditions: [], action: { type: "use_highest_power_action", effect: "shield" } }] }).success).toBe(true);
    expect(updatePetAiSchema.safeParse({ ...config, rules: [{ conditions: [], action: { type: "use_specific_jutsu", jutsuId: "unowned-jutsu" } }] }).success).toBe(false);
    expect(updatePetAiSchema.safeParse({ ...config, rules: [{ conditions: [], action: { type: "use_highest_power_action", effect: "summon" } }] }).success).toBe(false);
  });
});
