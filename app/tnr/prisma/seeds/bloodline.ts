import { type ZodBloodlineType } from "../../src/libs/combat/types";
import { type Prisma } from "@prisma/client/edge";
import { type PrismaClient } from "@prisma/client/edge";
import { LetterRank } from "@prisma/client/edge";

const bloodlines: ZodBloodlineType[] = [
  /*********************** */
  /**  D-Ranked Bloodline  */
  /*********************** */
  {
    name: "Shroud of the Heavens",
    image: "shroud_of_the_heavens.png",
    description:
      "The  bloodline is a more common and less potent form of wind-affinity lineage bloodlines, but it is still a powerful force to be reckoned with. Those born with this bloodline possess a limited but innate ability to control and manipulate the wind, allowing them to enhance their physical abilities and perform wind-based techniques.",
    rarity: LetterRank.D,
    regenIncrease: 0,
    village: "All",
    effects: [
      {
        type: "damage",
        timing: "now",
        calculation: "static",
        power: 1,
        statTypes: ["Genjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
      },
    ],
  },
  /*********************** */
  /**  C-Ranked Bloodline  */
  /*********************** */
  {
    name: "Tatsumaki",
    image: "tatsumaki.png",
    description:
      "The bloodline is a lineage that imbues its bearers with a mastery over the power of the wind. Those born with this bloodline possess an innate connection to the elements, allowing them to control and manipulate the very air itself to enhance their abilities.",
    rarity: LetterRank.C,
    regenIncrease: 0,
    village: "All",
    effects: [],
  },
  /*********************** */
  /**  B-Ranked Bloodline  */
  /*********************** */
  {
    name: "Darkwind",
    image: "darkwind.png",
    description:
      "The bloodline is a rare and feared lineage that grants its wielder an unparalleled mastery over the power of wind, twisted and corrupted by darkness. Those born with this bloodline possess an innate connection to the elements, allowing them to control and manipulate the very air itself with malevolent intent.",
    rarity: LetterRank.B,
    regenIncrease: 0,
    village: "All",
    effects: [],
  },
  /*********************** */
  /**  A-Ranked Bloodline  */
  /*********************** */
  {
    name: "Tornado Demon",
    image: "tornado_demon.png",
    description:
      "The bloodline is a legendary lineage that imbues its bearers with an otherworldly mastery over the power of the wind. Those born with this bloodline possess an inherent connection to the elements, enabling them to manipulate the very air itself to devastating effect. Through years of intense training and honing their natural abilities, the wielder of the bloodline can harness the full force of the wind to enhance their techniques, infusing them with incredible speed and power. Their attacks strike with the force of a hurricane, delivering blows that are both swift and deadly, leaving their enemies reeling and disoriented. The bloodline is a true testament to the power of the elements and the terrifying potential of those who can wield them.",
    rarity: LetterRank.A,
    regenIncrease: 0,
    village: "All",
    effects: [],
  },
  /*********************** */
  /**  S-Ranked Bloodline  */
  /*********************** */
  {
    name: "Blue Blade Eyes",
    image: "blue_blade_eyes.png",
    description:
      "This bloodline is a rare and coveted genetic trait that grants its bearer unparalleled mastery over the art of combat. With eyes that shimmer like blades of sapphire, those born with this bloodline possess a natural affinity for chakra manipulation and supreme physical prowess. Through years of intense training and discipline, the wielder of the bloodline can harness their innate abilities to devastating effect. With each strike, their enemies feel the raw power of their chakra, coursing through their bodies like a tidal wave of destruction. Their speed and agility are unmatched, allowing them to evade attacks with ease and strike their opponents with pinpoint accuracy. The bloodline is a fearsome and formidable force to be reckoned with, and those who possess it are destined for greatness on the battlefield.",
    rarity: LetterRank.S,
    regenIncrease: 10,
    village: "All",
    effects: [],
  },
];

// Delete anything not in above list, and insert those missing
export const seedBloodlines = async (prisma: PrismaClient) => {
  for (const bloodline of bloodlines) {
    await prisma.bloodline.upsert({
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
  }
};
