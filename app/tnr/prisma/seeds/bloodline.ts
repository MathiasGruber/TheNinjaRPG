import { type ZodBloodlineType } from "../../src/libs/combat/types";
import { type Prisma, type Bloodline } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";
import { LetterRank } from "@prisma/client";
import { DamageTag, AdjustStatTag } from "../../src/libs/combat/types";
import { AdjustDamageGivenTag } from "../../src/libs/combat/types";
import { AdjustDamageTakenTag } from "../../src/libs/combat/types";

const bloodlines: ZodBloodlineType[] = [
  /*********************** */
  /**  D-Ranked Bloodline  */
  /*********************** */
  {
    name: "Shroud of the Heavens",
    image: "/bloodlines/shroud_of_the_heavens.png",
    description:
      "This  bloodline is a more common and less potent form of the wind-affinity lineage bloodlines, but it is still a powerful force to be reckoned with. Those born with this bloodline possess a limited but innate ability to control and manipulate the wind, allowing them to enhance their physical abilities and perform wind-based techniques.",
    rank: LetterRank.D,
    regenIncrease: 0,
    village: "All",
    effects: [
      AdjustStatTag.parse({
        calculation: "percentage",
        power: 5,
        powerPerLevel: 0.5,
        statTypes: ["Ninjutsu"],
        generalTypes: ["Willpower"],
        elements: ["Wind"],
      }),
    ],
  },
  /*********************** */
  /**  C-Ranked Bloodline  */
  /*********************** */
  {
    name: "Tatsumaki",
    image: "/bloodlines/tatsumaki.png",
    description:
      "This is a lineage that imbues its bearers with a mastery over the power of the wind. Those born with this bloodline possess an innate connection to the elements, allowing them to control and manipulate the very air itself to enhance their abilities.",
    rank: LetterRank.C,
    regenIncrease: 0,
    village: "All",
    effects: [
      AdjustStatTag.parse({
        calculation: "percentage",
        power: 10,
        powerPerLevel: 0.5,
        statTypes: ["Ninjutsu"],
        generalTypes: ["Willpower"],
        elements: ["Wind"],
      }),
    ],
  },
  /*********************** */
  /**  B-Ranked Bloodline  */
  /*********************** */
  {
    name: "Darkwind",
    image: "/bloodlines/darkwind.png",
    description:
      "The bloodline is a rare and feared lineage that grants its wielder an unparalleled mastery over the power of wind, twisted and corrupted by darkness. Those born with this bloodline possess an innate connection to the elements, allowing them to control and manipulate the very air itself with malevolent intent.",
    rank: LetterRank.B,
    regenIncrease: 0,
    village: "All",
    effects: [
      AdjustStatTag.parse({
        calculation: "percentage",
        power: 15,
        powerPerLevel: 0.5,
        statTypes: ["Ninjutsu"],
        generalTypes: ["Willpower", "Intelligence"],
        elements: ["Wind"],
      }),
    ],
  },
  /*********************** */
  /**  A-Ranked Bloodline  */
  /*********************** */
  {
    name: "Tornado Demon",
    image: "/bloodlines/tornado_demon.png",
    description:
      "The bloodline is a legendary lineage that imbues its bearers with an otherworldly mastery over the power of the wind. Those born with this bloodline possess an inherent connection to the elements, enabling them to manipulate the very air itself to devastating effect. The bloodline is a true testament to the power of the elements and the terrifying potential of those who can wield them.",
    rank: LetterRank.A,
    regenIncrease: 0,
    village: "All",
    effects: [
      AdjustStatTag.parse({
        calculation: "percentage",
        power: 20,
        powerPerLevel: 0.5,
        statTypes: ["Ninjutsu", "Genjutsu"],
        generalTypes: ["Willpower", "Intelligence"],
        elements: ["Wind"],
      }),
    ],
  },
  /*********************** */
  /**  S-Ranked Bloodline  */
  /*********************** */
  {
    name: "Blue Blade Eyes",
    image: "/bloodlines/blue_blade_eyes.png",
    description:
      "This bloodline is a rare and coveted genetic trait that grants its bearer unparalleled mastery over the art of combat. With eyes that shimmer like blades of sapphire, those born with this bloodline possess a natural affinity for chakra manipulation and supreme physical prowess.The bloodline is a fearsome and formidable force to be reckoned with, and those who possess it are destined for greatness on the battlefield.",
    rank: LetterRank.S,
    regenIncrease: 10,
    village: "All",
    effects: [
      AdjustDamageGivenTag.parse({
        power: 10,
        statTypes: ["Genjutsu", "Ninjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
      }),
      AdjustDamageGivenTag.parse({
        power: 20,
        statTypes: ["Bukijutsu", "Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
      AdjustDamageTakenTag.parse({
        power: 10,
        statTypes: ["Genjutsu", "Ninjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
      }),
      AdjustDamageTakenTag.parse({
        power: 20,
        statTypes: ["Bukijutsu", "Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
];

// Bookkeeping
let counter = 0;
const total = bloodlines.length;

const upsertBloodline = async (prisma: PrismaClient, bloodline: ZodBloodlineType) => {
  // Database call
  const obj = await prisma.bloodline.upsert({
    where: {
      name: bloodline.name,
    },
    update: {
      ...bloodline,
      effects: bloodline.effects as unknown as Prisma.JsonArray,
    },
    create: {
      ...bloodline,
      effects: bloodline.effects as unknown as Prisma.JsonArray,
    },
  });
  // Progress
  counter++;
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine(1);
  console.log(`Syncing jutsu ${counter}/${total}`);
  return obj;
};

// Delete anything not in above list, and insert those missing
export const seedBloodlines = async (prisma: PrismaClient) => {
  console.log("\nSyncing bloodlines...\n");
  const promises: Promise<Bloodline>[] = [];
  for (const bloodline of bloodlines) {
    promises.push(upsertBloodline(prisma, bloodline));
  }
  await Promise.all(promises);
};
