import { type ZodItemType } from "../../src/libs/combat/types";
import { type Prisma } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";
import { AttackTarget } from "@prisma/client";
import { ItemType } from "@prisma/client";
import { WeaponType } from "@prisma/client";
import { ItemRarity } from "@prisma/client";
import { ItemSlotType } from "@prisma/client";

import { DamageTag } from "../../src/libs/combat/types";
import { HealTag } from "../../src/libs/combat/types";
import { AdjustArmorTag } from "../../src/libs/combat/types";

const items: ZodItemType[] = [
  /************ */
  /** WEAPONS  **/
  /************ */
  {
    name: "Pointy Stick",
    image: "/items/pointy_stick.webp",
    description:
      "A pointy stick Academy Students use to play around. Perfect for poking people.",
    canStack: false,
    stackSize: 1,
    destroyOnUse: false,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.STAFF,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.HAND,
    cost: 250,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "War Staff",
    image: "/items/war_staff.webp",
    description: "A trainees combat staff made from light metal",
    canStack: false,
    stackSize: 1,
    destroyOnUse: false,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.STAFF,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.HAND,
    cost: 400,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "Bloodstained Blade",
    image: "/items/bloodstained_blade.webp",
    description:
      "A massive rust covered blade with a blunted tip covered in demonic symbols incomprehensible to those outside of Yomi. It appears to have been used recently. What horrors has this blade seen?",
    canStack: false,
    stackSize: 1,
    destroyOnUse: false,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.SWORD,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.HAND,
    cost: 1000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "Soul Harvester",
    image: "/items/soul_harvester.webp",
    description:
      "A pitch-black axe with a pale blue tinge, it sucks the life out of any living thing it comes in contact with. It's said that if you listen closely, you can still hear the screams of those trapped inside...",
    canStack: false,
    stackSize: 1,
    destroyOnUse: false,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.AXE,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.HAND,
    cost: 2000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "Shuriken",
    image: "/items/shuriken.webp",
    description:
      "This flat, 4-sided star has razor sharp edges that allow it to cut through air and skin alike. Don't throw this at friends!",
    canStack: true,
    stackSize: 10,
    destroyOnUse: true,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.SHURIKEN,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.ITEM,
    cost: 25,
    range: 3,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "Short Knife",
    image: "/items/short_knife.webp",
    description:
      "A small, sharp knife. It's not very useful for anything other than stabbing people.",
    canStack: true,
    stackSize: 10,
    destroyOnUse: true,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.DAGGER,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.HAND,
    cost: 25,
    range: 3,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "Hachiwara",
    image: "/items/hachiwara.webp",
    description:
      "The Hachiwara is also called the 'helmet breaker'. Designed to cut open armor, this dagger-like weapon has a sharp tip and a small hook just above the pommel.",
    canStack: true,
    stackSize: 10,
    destroyOnUse: true,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.DAGGER,
    rarity: ItemRarity.RARE,
    slot: ItemSlotType.HAND,
    cost: 9000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "Solar Bow",
    image: "/items/solar_bow.webp",
    description:
      "This redwood and steel bow is a powerful weapon when used by ninjutsu, capable of amplifying the chakra fed into it, its bolts are stronger and faster than most conventional bows.",
    canStack: true,
    stackSize: 10,
    destroyOnUse: true,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.BOW,
    rarity: ItemRarity.EPIC,
    slot: ItemSlotType.HAND,
    cost: 50000,
    range: 5,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Strength", "Speed"],
      }),
    ],
  },
  {
    name: "Meteor Hammer",
    image: "/items/meteor_hammer.webp",
    description:
      "The Meteor Hammer is the Dart's bigger brother, a large melon shaped orb on a roughly 8 foot long rope. Just like the Dart, it requires the full body to be used properly. Unlike the dart, which is a puncture weapon, the Hammer is capable of breaking bones and smashing heads with great ease.",
    canStack: true,
    stackSize: 10,
    destroyOnUse: true,
    target: AttackTarget.CHARACTER,
    itemType: ItemType.WEAPON,
    weaponType: WeaponType.HAMMER,
    rarity: ItemRarity.LEGENDARY,
    slot: ItemSlotType.HAND,
    cost: 100000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 1,
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
    image: "/items/simple_vest.webp",
    description: "A leather vest with strategically located pockets for ninja tools",
    target: AttackTarget.CHARACTER,
    itemType: ItemType.ARMOR,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.CHEST,
    cost: 100,
    effects: [
      AdjustArmorTag.parse({
        type: "armoradjust",
        calculation: "static",
        power: 1,
        adjustUp: true,
      }),
    ],
  },
  /*****************/
  /** Consumables **/
  /*****************/
  {
    name: "Water",
    image: "/items/water.webp",
    description: "Refreshing water to quench your thirst and restore your health",
    target: AttackTarget.CHARACTER,
    itemType: ItemType.CONSUMABLE,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.ITEM,
    cost: 100,
    range: 0,
    effects: [
      HealTag.parse({
        rounds: 1,
        poolsAffected: ["Health"],
        calculation: "static",
        power: 10,
      }),
    ],
  },
  {
    name: "Chakra Water",
    image: "/items/chakra_water.webp",
    description: "Refreshing water infused with chakra to restore your energy",
    target: AttackTarget.CHARACTER,
    itemType: ItemType.CONSUMABLE,
    rarity: ItemRarity.COMMON,
    slot: ItemSlotType.ITEM,
    cost: 100,
    range: 0,
    effects: [
      HealTag.parse({
        rounds: 1,
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
