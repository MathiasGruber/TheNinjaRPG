import { describe, expect, it } from "bun:test";
import { type FederalStatus, FederalStatuses, PET_OPTION_COUNTS, PET_SPECIES_RARITY_WEIGHTS, PetRarities } from "@/drizzle/constants";
import { getDailyPetOptions, isAvailablePetAppearance, PET_SPECIES } from "@/libs/pets/catalogue";

describe("companion species rarity", () => {
  it("preserves the persisted species indices and assigns every species one rarity", () => {
    const names = ["Fox", "Wolf", "Hound", "Cat", "Lynx", "Tiger", "Leopard", "Lion", "Panther", "Snow leopard", "Red panda", "Tanuki", "Raccoon", "Badger", "Otter", "Ferret", "Marten", "Weasel", "Squirrel", "Chipmunk", "Rabbit", "Hare", "Hedgehog", "Porcupine", "Mouse", "Rat", "Chinchilla", "Hamster", "Mole", "Bat", "Bear", "Panda", "Deer", "Elk", "Goat", "Ram", "Boar", "Capybara", "Owl", "Hawk", "Falcon", "Raven", "Crow", "Crane", "Heron", "Kingfisher", "Sparrow", "Peacock", "Turtle", "Tortoise", "Gecko", "Chameleon", "Iguana", "Salamander", "Axolotl", "Frog", "Toad", "Snake", "Moth", "Butterfly", "Beetle", "Dragonfly", "Mantis", "Crab"];
    expect(PET_SPECIES.map(({ name }) => name)).toEqual(names);
    expect(PET_SPECIES.map(({ index }) => index)).toEqual(names.map((_, index) => index));
    expect(PetRarities.map((rarity) => PET_SPECIES.filter((option) => option.rarity === rarity).length)).toEqual([25, 22, 11, 4, 2]);
    expect(PET_SPECIES.every(({ rarity }) => PetRarities.includes(rarity))).toBe(true);
    expect(PET_SPECIES[9]).toEqual({ index: 9, name: "Snow leopard", description: "A fluffy snow leopard with a thick tail", rarity: "LEGENDARY" });
    expect(PET_SPECIES[54]).toEqual({ index: 54, name: "Axolotl", description: "A cheerful axolotl with feathery external gills", rarity: "LEGENDARY" });
  });

  it("keeps every tier's complete species menu when a subscription upgrades", () => {
    let previous = getDailyPetOptions("rarity-contract-player", "NONE", "2026-10-16");
    for (const tier of FederalStatuses) {
      const current = getDailyPetOptions("rarity-contract-player", tier, "2026-10-16");
      expect(current.species).toHaveLength(PET_OPTION_COUNTS[tier]);
      expect(current.species.slice(0, previous.species.length)).toEqual(previous.species);
      expect(new Set(current.species.map(({ index }) => index)).size).toBe(current.species.length);
      previous = current;
    }
  });

  it("defines valid basis-point odds for every selectable rarity", () => {
    for (const tier of FederalStatuses) {
      const weights = PET_SPECIES_RARITY_WEIGHTS[tier];
      expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBe(10_000);
      expect(PetRarities.every((rarity) => Number.isInteger(weights[rarity]) && weights[rarity] > 0)).toBe(true);
    }
  });

  it("continues offering unique animals after a rarity bucket is exhausted", () => {
    const { species } = getDailyPetOptions("rarity-cohort-759", "GOLD", "2026-10-16");
    expect(species.slice(0, 7).filter(({ rarity }) => rarity === "LEGENDARY")).toHaveLength(2);
    expect(species).toHaveLength(PET_OPTION_COUNTS.GOLD);
    expect(new Set(species.map(({ index }) => index)).size).toBe(species.length);
    expect(species[7]?.rarity).not.toBe("LEGENDARY");
  });

  it("leaves palette, characteristic and aura daily ordering unchanged", () => {
    const choices = getDailyPetOptions("rarity-contract-player", "GOLD", "2026-10-16");
    expect(choices.palettes.map(({ index }) => index)).toEqual([14, 12, 30, 5, 19, 10, 17, 2]);
    expect(choices.characteristics.map(({ index }) => index)).toEqual([11, 3, 4, 10, 5, 14, 6, 13]);
    expect(choices.auras.map(({ index }) => index)).toEqual([2, 4, 1, 7, 6, 3, 0, 5]);
    expect([...choices.palettes, ...choices.characteristics, ...choices.auras].some((option) => "rarity" in option)).toBe(false);
  });

  it("uses UTC-day/account seeds without accepting a catalogue species outside today's menu", () => {
    const choices = getDailyPetOptions("rarity-contract-player", "GOLD", "2026-10-16");
    expect(choices).toEqual(getDailyPetOptions("rarity-contract-player", "GOLD", "2026-10-16"));
    expect(choices.species).not.toEqual(getDailyPetOptions("another-player", "GOLD", "2026-10-16").species);
    expect(choices.species).not.toEqual(getDailyPetOptions("rarity-contract-player", "GOLD", "2026-10-17").species);
    const unavailable = PET_SPECIES.find(({ index }) => !choices.species.some((option) => option.index === index));
    if (!unavailable) throw new Error("Expected an unoffered species");
    expect(isAvailablePetAppearance({ speciesIndex: unavailable.index, paletteIndex: choices.palettes[0]!.index, characteristicIndex: choices.characteristics[0]!.index, auraIndex: choices.auras[0]!.index }, choices)).toBe(false);
  });

  it("weights rarity buckets and gives subscriber bonus slots better odds across fixed daily rolls", () => {
    const samples = 2500;
    const firstBonusSlot: Record<FederalStatus, number> = { NONE: 0, NORMAL: 3, SILVER: 5, GOLD: 6 };
    const commonCounts = { NONE: 0, NORMAL: 0, SILVER: 0, GOLD: 0 };
    const rareMenuCounts = { NONE: 0, NORMAL: 0, SILVER: 0, GOLD: 0 };
    const observedRarities = new Set<string>();
    for (let sample = 0; sample < samples; sample++) {
      const gold = getDailyPetOptions(`rarity-cohort-${sample}`, "GOLD", "2026-10-16");
      expect(new Set(gold.species.map(({ index }) => index)).size).toBe(PET_OPTION_COUNTS.GOLD);
      for (const option of gold.species) observedRarities.add(option.rarity);
      for (const tier of FederalStatuses) {
        const bonus = gold.species[firstBonusSlot[tier]];
        if (bonus?.rarity === "COMMON") commonCounts[tier]++;
        if (gold.species.slice(0, PET_OPTION_COUNTS[tier]).some(({ rarity }) => ["RARE", "EPIC", "LEGENDARY"].includes(rarity))) rareMenuCounts[tier]++;
      }
    }
    expect(observedRarities.size).toBe(PetRarities.length);
    for (const tier of FederalStatuses) {
      const weights = PET_SPECIES_RARITY_WEIGHTS[tier];
      const expectedCommonRate = weights.COMMON / Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      // A fixed cohort checks configured bucket odds, rather than weighting by species count.
      expect(Math.abs(commonCounts[tier] / samples - expectedCommonRate)).toBeLessThan(0.04);
    }
    for (let index = 1; index < FederalStatuses.length; index++) {
      const current = FederalStatuses[index]!;
      const previous = FederalStatuses[index - 1]!;
      expect(commonCounts[current]).toBeLessThan(commonCounts[previous]);
      expect(rareMenuCounts[current]).toBeGreaterThan(rareMenuCounts[previous]);
    }
  });
});
