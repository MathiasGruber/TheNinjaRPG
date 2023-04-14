import { type ZodItemType } from "../../src/libs/combat/types";
import { type Prisma } from "@prisma/client/edge";
import { type PrismaClient } from "@prisma/client/edge";
import { AttackTarget } from "@prisma/client/edge";
import { ItemType } from "@prisma/client/edge";
import { WeaponType } from "@prisma/client/edge";
import { ItemRarity } from "@prisma/client/edge";
import { ItemSlot } from "@prisma/client/edge";

const items: ZodItemType[] = [
  /************ */
  /** WEAPONS  **/
  /************ */
  {
    name: "Shuriken",
    image: "shuriken.png",
    description:
      "This flat, 4-sided star has razor sharp edges that allow it to cut through air and skin alike. Don't throw this at friends!",
    canStack: true,
    stackSize: 10,
    target: AttackTarget.OPPONENT,
    type: ItemType.CONSUMABLE,
    weaponType: WeaponType.SHURIKEN,
    rarity: ItemRarity.COMMON,
    slot: ItemSlot.BACKPACK,
    effects: [
      {
        type: "damage",
        timing: "now",
        calculation: "formula",
        power: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      },
    ],
  },
  /********** */
  /** Armor  **/
  /********** */
  {
    name: "Simple Vest",
    image: "simple_vest.png",
    description: "A leather vest with strategically located pockets for ninja tools",
    target: AttackTarget.OPPONENT,
    type: ItemType.WEAPON,
    rarity: ItemRarity.COMMON,
    slot: ItemSlot.CHEST,
    effects: [
      {
        type: "armoradjust",
        timing: "now",
        calculation: "static",
        power: 10,
        adjustUp: true,
      },
    ],
  },
];

// Delete anything not in above list, and insert those missing
export const seedItems = async (prisma: PrismaClient) => {
  for (const item of items) {
    await prisma.item.upsert({
      where: {
        name: item.name,
      },
      update: {
        ...item,
        effects: item.effects as unknown as Prisma.JsonArray,
      },
      create: {
        ...item,
        effects: item.effects as unknown as Prisma.JsonArray,
      },
    });
  }
};
