import { z } from "zod";
import type { Clan } from "@/drizzle/schema";

const bannedNames = [
  "Freedom State",
  "Tsukimori",
  "Glacier",
  "Shine",
  "Current",
  "Shroud",
];

export const clanCreateSchema = z.object({
  villageId: z.string(),
  name: z
    .string()
    .trim()
    .min(3)
    .max(88)
    .regex(new RegExp("^[a-zA-Z0-9_]+$"), {
      message: "Alphanumeric, no spaces",
    })
    .refine(
      (name) =>
        !bannedNames.some((banned) => banned.toLowerCase() === name.toLowerCase()),
      { message: "This clan name is not allowed." },
    ),
});

export type ClanCreateSchema = z.infer<typeof clanCreateSchema>;

export const factionEditSchema = z.object({
  clanId: z.string(),
  name: z
    .string()
    .trim()
    .min(3)
    .max(88)
    .refine(
      (name) =>
        !bannedNames.some((banned) => banned.toLowerCase() === name.toLowerCase()),
      { message: "This clan name is not allowed." },
    ),
  image: z.string(),
});

export type FactionEditSchema = z.infer<typeof factionEditSchema>;

export const factionColorEditSchema = z.object({
  clanId: z.string(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, {
    message: "Must be a valid hex color code",
  }),
});

export type FactionColorEditSchema = z.infer<typeof factionColorEditSchema>;

/**
 * Checks if a user is a clan leader.
 * @param userId - The ID of the user to check.
 * @param clan - The clan object to check against.
 * @returns A boolean indicating whether the user is a clan leader.
 */
export const checkCoLeader = (userId: string, clanData?: Clan | null) => {
  return [clanData?.coLeader1, clanData?.coLeader2, clanData?.coLeader3].includes(
    userId,
  );
};
