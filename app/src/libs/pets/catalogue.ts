import alea from "alea";
import { type FederalStatus, PET_OPTION_COUNTS } from "@/drizzle/constants";
import { getPetDayKey } from "@/utils/time";

export type PetAppearanceOption = {
  index: number;
  name: string;
  description: string;
};

const options = (entries: readonly (readonly [string, string])[]) =>
  entries.map(([name, description], index) => ({ index, name, description }));

/** Authored appearance traits never supply combat modifiers or free-form model instructions. */
export const PET_SPECIES = options([
  ["Fox", "A nimble fox with a bushy tail and pointed ears"],
  ["Wolf", "A compact wolf with thick fur and an alert muzzle"],
  ["Hound", "A loyal shinobi hound with floppy ears"],
  ["Cat", "A graceful cat with expressive eyes and a long tail"],
  ["Lynx", "A tuft-eared lynx with a short tail"],
  ["Tiger", "A small tiger with bold stripes and broad paws"],
  ["Leopard", "A lithe spotted leopard with a long tail"],
  ["Lion", "A proud young lion with a modest mane"],
  ["Panther", "A sleek panther with rounded ears"],
  ["Snow leopard", "A fluffy snow leopard with a thick tail"],
  ["Red panda", "A red panda with rounded ears and a ringed tail"],
  ["Tanuki", "A round tanuki with a friendly masked face"],
  ["Raccoon", "A clever raccoon with a striped tail"],
  ["Badger", "A sturdy badger with a striped face"],
  ["Otter", "A playful otter with webbed paws"],
  ["Ferret", "A slender ferret with a long flexible body"],
  ["Marten", "A woodland marten with a fluffy tail"],
  ["Weasel", "A quick little weasel with short legs"],
  ["Squirrel", "A woodland squirrel with a curled fluffy tail"],
  ["Chipmunk", "A tiny chipmunk with striped cheeks"],
  ["Rabbit", "A soft rabbit with long upright ears"],
  ["Hare", "A long-legged hare with very long ears"],
  ["Hedgehog", "A rounded hedgehog with soft stylized quills"],
  ["Porcupine", "A small porcupine with a fan of stylized quills"],
  ["Mouse", "A little field mouse with round ears"],
  ["Rat", "A resourceful rat with a long curling tail"],
  ["Chinchilla", "A fluffy chinchilla with large rounded ears"],
  ["Hamster", "A round hamster with plump cheeks"],
  ["Mole", "A velvety mole with broad digging paws"],
  ["Bat", "A friendly bat with folded leathery wings"],
  ["Bear", "A sturdy bear cub with rounded ears"],
  ["Panda", "A young panda with bold eye patches"],
  ["Deer", "A young deer with delicate antlers"],
  ["Elk", "A compact elk with branching antlers"],
  ["Goat", "A sure-footed goat with small curved horns"],
  ["Ram", "A woolly ram with curled horns"],
  ["Boar", "A young boar with small tusks and a bristled back"],
  ["Capybara", "A calm capybara with a broad muzzle"],
  ["Owl", "A watchful owl with broad folded wings"],
  ["Hawk", "A compact hawk with a hooked beak"],
  ["Falcon", "A swift falcon with pointed wings"],
  ["Raven", "A clever raven with glossy feathers"],
  ["Crow", "An alert crow with a compact silhouette"],
  ["Crane", "A graceful crane with a long neck"],
  ["Heron", "A patient heron with long legs"],
  ["Kingfisher", "A bright kingfisher with a pointed beak"],
  ["Sparrow", "A small sparrow with a round body"],
  ["Peacock", "A small peacock with a decorative tail fan"],
  ["Turtle", "A determined turtle with a patterned shell"],
  ["Tortoise", "A sturdy tortoise with a domed shell"],
  ["Gecko", "A nimble gecko with broad toes"],
  ["Chameleon", "A chameleon with a curled tail and gentle eyes"],
  ["Iguana", "A small iguana with a decorative back crest"],
  ["Salamander", "A smooth salamander with a long tail"],
  ["Axolotl", "A cheerful axolotl with feathery external gills"],
  ["Frog", "A springy frog with broad feet"],
  ["Toad", "A round toad with a textured back"],
  ["Snake", "A little snake in a loose upright coil"],
  ["Moth", "A fluffy moth with broad patterned wings"],
  ["Butterfly", "A butterfly with large symmetrical wings"],
  ["Beetle", "A sturdy beetle with a polished shell"],
  ["Dragonfly", "A dragonfly with four delicate wings"],
  ["Mantis", "A poised mantis with folded front limbs"],
  ["Crab", "A little crab with rounded claws"],
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

export const getDailyPetOptions = (
  userId: string,
  federalStatus: FederalStatus,
  dayKey = getPetDayKey(),
) => {
  const count = PET_OPTION_COUNTS[federalStatus];
  const seed = `${userId}:${dayKey}`;
  return {
    species: dailyOptions(PET_SPECIES, `${seed}:species`, count),
    palettes: dailyOptions(PET_PALETTES, `${seed}:palette`, count),
    characteristics: dailyOptions(PET_CHARACTERISTICS, `${seed}:characteristic`, count),
    auras: dailyOptions(PET_AURAS, `${seed}:aura`, count),
  };
};

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
