import { z } from "zod";
import type { Clan } from "@/drizzle/schema";

export const clanCreateSchema = z.object({
  villageId: z.string(),
  name: z.string().trim().min(3).max(88),
});

export type ClanCreateSchema = z.infer<typeof clanCreateSchema>;

export const clanRenameSchema = z.object({
  name: z.string().trim().min(3).max(88),
  image: z.string(),
});

export type ClanRenameSchema = z.infer<typeof clanRenameSchema>;

/**
 * Checks if a user is a clan leader.
 * @param userId - The ID of the user to check.
 * @param clan - The clan object to check against.
 * @returns A boolean indicating whether the user is a clan leader.
 */
export const checkCoLeader = (userId: string, clanData?: Clan) => {
  return [
    clanData?.coLeader1,
    clanData?.coLeader2,
    clanData?.coLeader3,
    clanData?.coLeader4,
  ].includes(userId);
};
