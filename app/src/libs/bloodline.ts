import { PITY_BLOODLINE_ROLLS } from "@/drizzle/constants";
import type { Bloodline, BloodlineRolls, UserData } from "@/drizzle/schema";
import type { LetterRank } from "@/drizzle/constants";

/**
 * Filters and sorts a list of bloodlines based on the specified rank, user data, and previous rolls.
 *
 * @param bloodlines - The array of bloodlines to filter.
 * @param rank - The rank to filter bloodlines by.
 * @param user - The user data containing village information.
 * @param previousRolls - The array of previous bloodline rolls.
 *
 * @returns A filtered and sorted array of bloodlines that match the specified criteria.
 */
export const filterRollableBloodlines = (info: {
  bloodlines: Bloodline[];
  rank: LetterRank | null | undefined;
  user: UserData;
  previousRolls: BloodlineRolls[];
}) => {
  const { bloodlines, rank, user, previousRolls } = info;
  const bloodlinePool = bloodlines
    .filter((b) => b.rank === rank)
    .filter((b) => !b.villageId || b.villageId === user.villageId)
    .map((b) => ({
      ...b,
      prevRolls: previousRolls.find((r) => r.bloodlineId === b.id)?.used || 0,
    }))
    .sort((a, b) => a.prevRolls - b.prevRolls)
    .filter((b, _, all) => {
      const minRolls = all?.[0]?.prevRolls || 0;
      return b.prevRolls <= minRolls;
    });
  return bloodlinePool;
};

/**
 * Calculates the number of pity rolls based on the provided BloodlineRolls object.
 *
 * @param roll - An optional BloodlineRolls object containing the number of used rolls and pity rolls.
 * @returns The number of pity rolls calculated from the unused rolls.
 */
export const getPityRolls = (roll: BloodlineRolls) => {
  const nNormalRolls = roll?.used ?? 0;
  const nPityRolls = roll?.pityRolls ?? 0;
  const unusedRolls = nNormalRolls - PITY_BLOODLINE_ROLLS * nPityRolls;
  const availablePityRolls = Math.floor(unusedRolls / PITY_BLOODLINE_ROLLS);
  return availablePityRolls;
};
