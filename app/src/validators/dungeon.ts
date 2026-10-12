import { z } from "zod";
import {
  COMBAT_BIOMES,
  DUNGEON_FLOORS_PER_TIER,
  DUNGEON_MAX_MOBS,
  DUNGEON_MAX_TIERS,
  DUNGEON_MAX_WAVES,
  MAP_SECTOR_ID_MAX,
  MAP_SECTOR_ID_MIN,
  SECTOR_HEIGHT,
  SECTOR_WIDTH,
} from "@/drizzle/constants";

const dungeonDropSchema = z.object({
  type: z.enum(["item", "jutsu"]),
  id: z.string().min(1),
  chance: z.number().min(1).max(100),
});
export const dungeonWaveSchema = z.object({
  aiIds: z.array(z.string().min(1)).min(1).max(DUNGEON_MAX_MOBS),
  delayRounds: z.number().int().min(0).max(20).prefault(0),
});
export const dungeonFloorSchema = z.object({
  kind: z.enum(["floor", "mini-boss", "boss"]),
  waves: z.array(dungeonWaveSchema).min(1).max(DUNGEON_MAX_WAVES),
});
export const dungeonContentSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000).prefault(""),
    sector: z.number().int().min(MAP_SECTOR_ID_MIN).max(MAP_SECTOR_ID_MAX),
    longitude: z
      .number()
      .int()
      .min(0)
      .max(SECTOR_WIDTH - 1),
    latitude: z
      .number()
      .int()
      .min(0)
      .max(SECTOR_HEIGHT - 1),
    expiresAt: z.coerce.date().nullable(),
    hidden: z.boolean().prefault(true),
    background: z.enum(COMBAT_BIOMES).prefault("default"),
    tiers: z
      .array(z.array(dungeonFloorSchema).length(DUNGEON_FLOORS_PER_TIER))
      .min(1)
      .max(DUNGEON_MAX_TIERS),
    rewards: z.object({
      money: z.number().min(0).max(1e9).prefault(0),
      experience: z.number().min(0).max(1e9).prefault(0),
      tokens: z.number().int().min(0).max(1e9).prefault(0),
      prestige: z.number().int().min(0).max(1e9).prefault(0),
      drops: z.array(dungeonDropSchema).max(100).prefault([]),
    }),
  })
  .superRefine((content, ctx) => {
    content.tiers.forEach((tier, ti) => {
      tier.forEach((floor, fi) => {
        const last =
          ti === content.tiers.length - 1 && fi === DUNGEON_FLOORS_PER_TIER - 1;
        const expected = last
          ? "boss"
          : fi === DUNGEON_FLOORS_PER_TIER - 1
            ? "mini-boss"
            : "floor";
        if (floor.kind !== expected)
          ctx.addIssue({
            code: "custom",
            path: ["tiers", ti, fi, "kind"],
            message: `This room must be a ${expected}`,
          });
        if (floor.waves[0]?.delayRounds !== 0)
          ctx.addIssue({
            code: "custom",
            path: ["tiers", ti, fi, "waves", 0, "delayRounds"],
            message: "The first wave must start immediately",
          });
      });
    });
  });
export const saveDungeonSchema = z.object({
  id: z.string().optional(),
  content: dungeonContentSchema,
});
export const dungeonIdSchema = z.object({ id: z.string().min(1) });
export const dungeonSectorSchema = z.object({
  sector: z.number().int().min(MAP_SECTOR_ID_MIN).max(MAP_SECTOR_ID_MAX),
});
export const dungeonActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum([
    "invite",
    "accept",
    "decline",
    "remove",
    "leave",
    "ready",
    "unready",
    "start",
    "pause",
    "resume",
  ]),
  userId: z.string().optional(),
});
export type DungeonContent = z.infer<typeof dungeonContentSchema>;
export type DungeonFloor = z.infer<typeof dungeonFloorSchema>;
export type DungeonRunState = {
  entryStartedAt?: number;
  entryPreviousDeadline?: number | null;
  invitedIds: string[];
  readyIds: string[];
  memberIds: string[];
  floor: number;
  clearedFloors: number[];
  message: string;
};
export type DungeonRewardReceipt = {
  money: number;
  experience: number;
  tokens: number;
  prestige: number;
  items: string[];
  jutsus: string[];
};
