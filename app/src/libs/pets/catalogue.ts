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
import { getPetDayKey } from "@/utils/time";

/** A catalogue ID persisted on pets, with authored display and model-prompt text. */
export type PetAppearanceOption = {
  index: number;
  name: string;
  description: string;
  rarity?: PetRarity;
};

/** Species additionally participate in rarity-weighted daily sampling. */
export type PetSpeciesOption = PetAppearanceOption & { rarity: PetRarity };

// Array positions are persisted trait IDs. Append new entries; never reorder or
// reuse existing positions, so accepted pets retain their original identity.
const options = (entries: readonly (readonly [string, string])[]) =>
  entries.map(([name, description], index) => ({ index, name, description }));

const speciesOptions = (
  entries: readonly (readonly [string, string, PetRarity])[],
): PetSpeciesOption[] =>
  entries.map(([name, description, rarity], index) => ({
    index,
    name,
    description,
    rarity,
  }));

/** Authored appearance traits never supply combat modifiers or free-form model instructions. */
export const PET_SPECIES = speciesOptions([
  ["Fox", "A nimble fox with a bushy tail and pointed ears", "UNCOMMON"],
  ["Wolf", "A compact wolf with thick fur and an alert muzzle", "UNCOMMON"],
  ["Hound", "A loyal shinobi hound with floppy ears", "COMMON"],
  ["Cat", "A graceful cat with expressive eyes and a long tail", "COMMON"],
  ["Lynx", "A tuft-eared lynx with a short tail", "RARE"],
  ["Tiger", "A small tiger with bold stripes and broad paws", "EPIC"],
  ["Leopard", "A lithe spotted leopard with a long tail", "RARE"],
  ["Lion", "A proud young lion with a modest mane", "EPIC"],
  ["Panther", "A sleek panther with rounded ears", "EPIC"],
  ["Snow leopard", "A fluffy snow leopard with a thick tail", "LEGENDARY"],
  ["Red panda", "A red panda with rounded ears and a ringed tail", "RARE"],
  ["Tanuki", "A round tanuki with a friendly masked face", "UNCOMMON"],
  ["Raccoon", "A clever raccoon with a striped tail", "COMMON"],
  ["Badger", "A sturdy badger with a striped face", "UNCOMMON"],
  ["Otter", "A playful otter with webbed paws", "COMMON"],
  ["Ferret", "A slender ferret with a long flexible body", "COMMON"],
  ["Marten", "A woodland marten with a fluffy tail", "UNCOMMON"],
  ["Weasel", "A quick little weasel with short legs", "COMMON"],
  ["Squirrel", "A woodland squirrel with a curled fluffy tail", "COMMON"],
  ["Chipmunk", "A tiny chipmunk with striped cheeks", "COMMON"],
  ["Rabbit", "A soft rabbit with long upright ears", "COMMON"],
  ["Hare", "A long-legged hare with very long ears", "COMMON"],
  ["Hedgehog", "A rounded hedgehog with soft stylized quills", "UNCOMMON"],
  ["Porcupine", "A small porcupine with a fan of stylized quills", "UNCOMMON"],
  ["Mouse", "A little field mouse with round ears", "COMMON"],
  ["Rat", "A resourceful rat with a long curling tail", "COMMON"],
  ["Chinchilla", "A fluffy chinchilla with large rounded ears", "UNCOMMON"],
  ["Hamster", "A round hamster with plump cheeks", "COMMON"],
  ["Mole", "A velvety mole with broad digging paws", "COMMON"],
  ["Bat", "A friendly bat with folded leathery wings", "UNCOMMON"],
  ["Bear", "A sturdy bear cub with rounded ears", "UNCOMMON"],
  ["Panda", "A young panda with bold eye patches", "RARE"],
  ["Deer", "A young deer with delicate antlers", "UNCOMMON"],
  ["Elk", "A compact elk with branching antlers", "RARE"],
  ["Goat", "A sure-footed goat with small curved horns", "COMMON"],
  ["Ram", "A woolly ram with curled horns", "UNCOMMON"],
  ["Boar", "A young boar with small tusks and a bristled back", "COMMON"],
  ["Capybara", "A calm capybara with a broad muzzle", "UNCOMMON"],
  ["Owl", "A watchful owl with broad folded wings", "UNCOMMON"],
  ["Hawk", "A compact hawk with a hooked beak", "UNCOMMON"],
  ["Falcon", "A swift falcon with pointed wings", "RARE"],
  ["Raven", "A clever raven with glossy feathers", "UNCOMMON"],
  ["Crow", "An alert crow with a compact silhouette", "COMMON"],
  ["Crane", "A graceful crane with a long neck", "RARE"],
  ["Heron", "A patient heron with long legs", "UNCOMMON"],
  ["Kingfisher", "A bright kingfisher with a pointed beak", "RARE"],
  ["Sparrow", "A small sparrow with a round body", "COMMON"],
  ["Peacock", "A small peacock with a decorative tail fan", "EPIC"],
  ["Turtle", "A determined turtle with a patterned shell", "COMMON"],
  ["Tortoise", "A sturdy tortoise with a domed shell", "UNCOMMON"],
  ["Gecko", "A nimble gecko with broad toes", "UNCOMMON"],
  ["Chameleon", "A chameleon with a curled tail and gentle eyes", "RARE"],
  ["Iguana", "A small iguana with a decorative back crest", "RARE"],
  ["Salamander", "A smooth salamander with a long tail", "UNCOMMON"],
  ["Axolotl", "A cheerful axolotl with feathery external gills", "LEGENDARY"],
  ["Frog", "A springy frog with broad feet", "COMMON"],
  ["Toad", "A round toad with a textured back", "COMMON"],
  ["Snake", "A little snake in a loose upright coil", "UNCOMMON"],
  ["Moth", "A fluffy moth with broad patterned wings", "COMMON"],
  ["Butterfly", "A butterfly with large symmetrical wings", "COMMON"],
  ["Beetle", "A sturdy beetle with a polished shell", "COMMON"],
  ["Dragonfly", "A dragonfly with four delicate wings", "UNCOMMON"],
  ["Mantis", "A poised mantis with folded front limbs", "RARE"],
  ["Crab", "A little crab with rounded claws", "COMMON"],
] as const);

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
const dailySpecies = (seed: string, count: number) => {
  const random = alea(seed);
  const remaining = [...PET_SPECIES];
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
 * Reproduce an owner's UTC-day offerings without storing a daily catalogue.
 * Subscriber tiers extend the same ordered prefix; species are drawn without
 * replacement and the other trait families use independent deterministic seeds.
 */
export const getDailyPetOptions = (
  userId: string,
  federalStatus: FederalStatus,
  dayKey = getPetDayKey(),
) => {
  const count = PET_OPTION_COUNTS[federalStatus];
  const seed = `${userId}:${dayKey}`;
  return {
    species: dailySpecies(`${seed}:species`, count),
    palettes: dailyOptions(PET_PALETTES, `${seed}:palette`, count),
    characteristics: dailyOptions(PET_CHARACTERISTICS, `${seed}:characteristic`, count),
    auras: dailyOptions(PET_AURAS, `${seed}:aura`, count),
  };
};

/** Verify all four submitted catalogue IDs belong to the supplied daily offerings. */
export const isAvailablePetAppearance = (
  selection: {
    speciesIndex: number;
    paletteIndex: number;
    characteristicIndex: number;
    auraIndex: number;
  },
  choices: ReturnType<typeof getDailyPetOptions>,
) =>
  choices.species.some(({ index }) => index === selection.speciesIndex) &&
  choices.palettes.some(({ index }) => index === selection.paletteIndex) &&
  choices.characteristics.some(
    ({ index }) => index === selection.characteristicIndex,
  ) &&
  choices.auras.some(({ index }) => index === selection.auraIndex);
