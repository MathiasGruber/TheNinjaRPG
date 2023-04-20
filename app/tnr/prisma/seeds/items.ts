import { type ZodItemType } from "../../src/libs/combat/types";
import { type Prisma } from "@prisma/client/edge";
import { type PrismaClient } from "@prisma/client/edge";
import { AttackTarget } from "@prisma/client/edge";
import { ItemType } from "@prisma/client/edge";
import { WeaponType } from "@prisma/client/edge";
import { ItemRarity } from "@prisma/client/edge";
import { ItemSlot } from "@prisma/client/edge";

import { DamageTag } from "../../src/libs/combat/types";
import { HealTag } from "../../src/libs/combat/types";
import { AdjustArmorTag } from "../../src/libs/combat/types";

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
    destroyOnUse: true,
    target: AttackTarget.OPPONENT,
    type: ItemType.WEAPON,
    weaponType: WeaponType.SHURIKEN,
    rarity: ItemRarity.COMMON,
    slot: ItemSlot.BACKPACK,
    effects: [
      DamageTag.parse({
        power: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
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
    type: ItemType.ARMOR,
    rarity: ItemRarity.COMMON,
    slot: ItemSlot.CHEST,
    effects: [
      AdjustArmorTag.parse({
        type: "armoradjust",
        calculation: "static",
        power: 10,
        adjustUp: true,
      }),
    ],
  },
  /*****************/
  /** Consumables **/
  /*****************/
  {
    name: "Water",
    image: "water.png",
    description: "Refreshing water to quench your thirst and restore your health",
    target: AttackTarget.SELF,
    type: ItemType.CONSUMABLE,
    rarity: ItemRarity.COMMON,
    slot: ItemSlot.BACKPACK,
    effects: [
      HealTag.parse({
        poolsAffected: ["Health"],
        calculation: "static",
        power: 10,
      }),
    ],
  },
  {
    name: "Chakra Water",
    image: "chakra_water.png",
    description: "Refreshing water infused with chakra to restore your energy",
    target: AttackTarget.SELF,
    type: ItemType.CONSUMABLE,
    rarity: ItemRarity.COMMON,
    slot: ItemSlot.BACKPACK,
    effects: [
      HealTag.parse({
        poolsAffected: ["Chakra"],
        calculation: "static",
        power: 10,
      }),
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
