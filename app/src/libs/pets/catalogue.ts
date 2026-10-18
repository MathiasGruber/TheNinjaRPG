/** Authored cosmetic identities and deterministic, owner-specific daily offerings. */
import alea from "alea";
import {
  type FederalStatus,
  FederalStatuses,
  PET_OPTION_COUNTS,
  PET_SPECIES_RARITY_WEIGHTS,
  PetRarities,
  type PetRarity,
} from "@/drizzle/constants";
import type { PetSpecies, UserData } from "@/drizzle/schema";
import { getPetDayKey } from "@/utils/time";

/** A catalogue ID persisted on pets, with authored display and model-prompt text. */
export type PetAppearanceOption = {
  index: number;
  name: string;
  description: string;
  rarity?: PetRarity;
};

/** Species additionally participate in rarity-weighted daily sampling. */
export type PetSpeciesOption = Pick<
  PetSpecies,
  "id" | "name" | "description" | "rarity" | "isActive"
>;

// Cosmetic array positions are persisted trait IDs; append new entries without reordering.
const options = (entries: readonly (readonly [string, string])[]) =>
  entries.map(([name, description], index) => ({ index, name, description }));

export const PET_PALETTES = options([
  ["Ember", "Warm russet, charcoal and amber"],
  ["Moonlit", "Silver, slate and pale blue"],
  ["Forest", "Moss green, bark brown and cream"],
  ["Sakura", "Rose pink, ivory and plum"],
  ["Ocean", "Deep navy, sea teal and pearl"],
  ["Sandstone", "Ochre, sand and warm white"],
  ["Storm", "Graphite, lavender grey and electric blue"],
  ["Sunrise", "Apricot, coral and soft gold"],
  ["Snow", "White, ice blue and cool grey"],
  ["Obsidian", "Black, dark violet and silver"],
  ["Jade", "Jade green, dark teal and cream"],
  ["Copper", "Copper brown, bronze and charcoal"],
  ["Amethyst", "Purple, lilac and pale silver"],
  ["Ruby", "Crimson, burgundy and warm grey"],
  ["Sapphire", "Royal blue, midnight and white"],
  ["Topaz", "Golden yellow, amber and cream"],
  ["Mint", "Mint green, pale aqua and ivory"],
  ["Lilac", "Lilac, soft violet and porcelain"],
  ["Peach", "Peach, warm beige and rose"],
  ["Autumn", "Burnt orange, chestnut and mustard"],
  ["Dusk", "Dusky mauve, ink blue and rose gold"],
  ["Dawn", "Soft coral, pale blue and ivory"],
  ["Ash", "Ash grey, smoke blue and chalk"],
  ["Honey", "Honey gold, warm brown and cream"],
  ["Lagoon", "Turquoise, deep green and pearl"],
  ["Plum", "Dark plum, rose and silver"],
  ["Cocoa", "Chocolate brown, caramel and ivory"],
  ["Lichen", "Sage, muted olive and stone"],
  ["Coral", "Coral red, sea blue and cream"],
  ["Midnight", "Midnight blue, violet and moon silver"],
  ["Lotus", "Lotus pink, leafy green and white"],
  ["Monochrome", "Black, white and carefully shaded grey"],
] as const);

export const PET_CHARACTERISTICS = options([
  ["Star marking", "A small star-shaped forehead marking"],
  ["Crescent marking", "A small crescent-shaped forehead marking"],
  ["Spiral marking", "A gentle spiral pattern on the shoulder or wing"],
  ["Leaf marking", "A small leaf-shaped marking on the cheek"],
  ["Bright eyes", "Large bright eyes with a clear highlight"],
  ["Mismatched eyes", "Two distinct, harmonious eye colours"],
  ["Fluffy crest", "A soft decorative crest on the head"],
  ["Tufted silhouette", "Small ornamental tufts along the silhouette"],
  ["Striped accents", "Fine contrasting stripe accents"],
  ["Dappled accents", "Small contrasting dappled spots"],
  ["Pale tips", "Light-coloured tips on ears, wings or limbs"],
  ["Dark tips", "Dark-coloured tips on ears, wings or limbs"],
  ["Neck scarf", "A small plain cloth scarf around the neck"],
  ["Cord bracelet", "A simple woven cord on one limb"],
  ["Bell charm", "A small round bell charm on a woven collar"],
  ["Leaf charm", "A little carved leaf charm on a woven collar"],
] as const);

export const PET_AURAS = options([
  ["Wind", "A few subtle pale wind wisps close to the body"],
  ["Water", "A few subtle floating blue water droplets"],
  ["Ember", "A few tiny warm ember motes without fire or smoke"],
  ["Earth", "A few subtle golden dust motes"],
  ["Lightning", "A few short, gentle violet sparks"],
  ["Moon", "A faint cool moonlit glow at the silhouette"],
  ["Leaf", "Two or three tiny drifting leaf-shaped motes"],
  ["Spirit", "A few faint pearl-coloured spirit motes"],
] as const);

/** Stable ordering keeps a subscriber's additional choices from replacing their free choices. */
const dailyOptions = (
  catalogue: readonly PetAppearanceOption[],
  seed: string,
  count: number,
) =>
  catalogue
    .map((option) => ({ option, score: alea(`${seed}:${option.index}`)() }))
    .sort((a, b) => a.score - b.score || a.option.index - b.option.index)
    .slice(0, count)
    .map(({ option }) => option);

/**
 * Every tier sees the same prefix. Additional subscriber slots roll with that
 * tier's better rarity weights, without replacing any previously offered animal.
 * Rarity is rolled before species so a tier's odds do not depend on bucket size.
 */
const dailySpecies = (
  species: readonly PetSpeciesOption[],
  seed: string,
  count: number,
) => {
  const random = alea(seed);
  const remaining = species
    .filter((entry) => entry.isActive)
    .sort((a, b) => a.id.localeCompare(b.id));
  const selected: PetSpeciesOption[] = [];
  for (let slot = 0; slot < count && remaining.length > 0; slot += 1) {
    const tier = FederalStatuses.find((status) => slot < PET_OPTION_COUNTS[status]);
    if (!tier) break;
    const weights = PET_SPECIES_RARITY_WEIGHTS[tier];
    const buckets = PetRarities.map((rarity) => ({
      weight: weights[rarity],
      species: remaining.filter((option) => option.rarity === rarity),
    })).filter((bucket) => bucket.species.length > 0 && bucket.weight > 0);
    let roll = random() * buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
    const bucket = buckets.find(({ weight }) => {
      roll -= weight;
      return roll < 0;
    });
    if (!bucket) throw new Error("No available companion species for rarity roll");
    const species = bucket.species[Math.floor(random() * bucket.species.length)];
    if (!species) throw new Error("No companion species in selected rarity");
    selected.push(species);
    remaining.splice(remaining.indexOf(species), 1);
  }
  return selected;
};

/**
 * Reproduce an owner's UTC-day offerings from the current available species.
 * Subscriber tiers extend the same ordered prefix; species are drawn without
 * replacement and the other trait families use independent deterministic seeds.
 * Remove claims after rolling so adoption cannot replace a consumed daily offer.
 */
export const getDailyPetOptions = (
  userId: string,
  federalStatus: FederalStatus,
  species: readonly PetSpeciesOption[],
  dayKey = getPetDayKey(),
  claims?: UserData["petDailyClaims"],
) => {
  const count = PET_OPTION_COUNTS[federalStatus];
  const seed = `${userId}:${dayKey}`;
  return {
    species: dailySpecies(species, `${seed}:species`, count).filter(
      ({ id }) => claims?.dayKey !== dayKey || !claims.speciesIds.includes(id),
    ),
    palettes: dailyOptions(PET_PALETTES, `${seed}:palette`, count),
    characteristics: dailyOptions(PET_CHARACTERISTICS, `${seed}:characteristic`, count),
    auras: dailyOptions(PET_AURAS, `${seed}:aura`, count),
  };
};

/** Verify all four submitted catalogue IDs belong to the supplied daily offerings. */
export const isAvailablePetAppearance = (
  selection: {
    speciesId: string;
    paletteIndex: number;
    characteristicIndex: number;
    auraIndex: number;
  },
  choices: ReturnType<typeof getDailyPetOptions>,
) =>
  choices.species.some(({ id }) => id === selection.speciesId) &&
  choices.palettes.some(({ index }) => index === selection.paletteIndex) &&
  choices.characteristics.some(
    ({ index }) => index === selection.characteristicIndex,
  ) &&
  choices.auras.some(({ index }) => index === selection.auraIndex);
