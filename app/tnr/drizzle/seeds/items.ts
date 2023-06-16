import { createId } from "@paralleldrive/cuid2";
import { item } from "../schema.ts";
import { eq } from "drizzle-orm";
import { DamageTag } from "../../src/libs/combat/types";
import { HealTag } from "../../src/libs/combat/types";
import { AdjustArmorTag } from "../../src/libs/combat/types";
import type { ZodItemType } from "../../src/libs/combat/types";
import type { DrizzleClient } from "../../src/server/db.ts";

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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "STAFF" as const,
    rarity: "COMMON" as const,
    slot: "HAND" as const,
    cost: 250,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "STAFF" as const,
    rarity: "COMMON" as const,
    slot: "HAND" as const,
    cost: 400,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "SWORD" as const,
    rarity: "COMMON" as const,
    slot: "HAND" as const,
    cost: 1000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "AXE" as const,
    rarity: "COMMON" as const,
    slot: "HAND" as const,
    cost: 2000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "SHURIKEN" as const,
    rarity: "COMMON" as const,
    slot: "ITEM" as const,
    cost: 25,
    range: 3,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "DAGGER" as const,
    rarity: "COMMON" as const,
    slot: "HAND" as const,
    cost: 25,
    range: 3,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "DAGGER" as const,
    rarity: "RARE" as const,
    slot: "HAND" as const,
    cost: 9000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "BOW" as const,
    rarity: "EPIC" as const,
    slot: "HAND" as const,
    cost: 50000,
    range: 5,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "WEAPON" as const,
    weaponType: "HAMMER" as const,
    rarity: "LEGENDARY" as const,
    slot: "HAND" as const,
    cost: 100000,
    range: 1,
    effects: [
      DamageTag.parse({
        power: 1,
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "ARMOR" as const,
    rarity: "COMMON" as const,
    slot: "CHEST" as const,
    cost: 100,
    effects: [
      AdjustArmorTag.parse({
        type: "armoradjust",
        calculation: "static",
        power: 1,
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
    target: "CHARACTER" as const,
    itemType: "CONSUMABLE" as const,
    rarity: "COMMON" as const,
    slot: "ITEM" as const,
    cost: 100,
    range: 0,
    effects: [
      HealTag.parse({
        rounds: 0,
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
    target: "CHARACTER" as const,
    itemType: "CONSUMABLE" as const,
    rarity: "COMMON" as const,
    slot: "ITEM" as const,
    cost: 100,
    range: 0,
    effects: [
      HealTag.parse({
        rounds: 0,
        poolsAffected: ["Chakra"],
        calculation: "static",
        power: 10,
      }),
    ],
  },
];

// Bookkeeping
let counter = 0;
const total = items.length;

const upsertIten = async (client: DrizzleClient, data: ZodItemType) => {
  // Database call
  const obj = await client.query.item.findFirst({
    where: eq(item.name, data.name),
  });
  const formatted = {
    ...data,
    canStack: data.canStack ? 1 : 0,
    destroyOnUse: data.destroyOnUse ? 1 : 0,
  };
  if (obj) {
    await client.update(item).set(formatted).where(eq(item.name, data.name));
  } else {
    await client.insert(item).values({
      id: createId(),
      ...formatted,
    });
  }
  // Progress
  counter++;
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine(1);
  console.log(`Syncing item ${counter}/${total}`);
};

// Delete anything not in above list, and insert those missing
export const seedItems = async (client: DrizzleClient) => {
  console.log("\nSyncing items...\n");
  const promises: Promise<void>[] = [];
  for (const item of items) {
    promises.push(upsertIten(client, item));
  }
  await Promise.all(promises);
};
