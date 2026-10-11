import { getUserCaps, PET_RANKS, type UserRank } from "@/drizzle/constants";
import type { UserPet } from "@/drizzle/schema";
import { calcLevelRequirements } from "@/libs/profile";

export const getPetRank = (rank: number) =>
  PET_RANKS.find((entry) => entry.rank === rank) ?? PET_RANKS[0];

export const getMaxPetRank = (ownerRank: UserRank) => {
  const ranks: Record<UserRank, number> = {
    STUDENT: 1,
    GENIN: 3,
    CHUNIN: 5,
    JONIN: 7,
    "ELITE JONIN": 9,
    ELDER: 10,
    NONE: 0,
  };
  return ranks[ownerRank];
};

/** A visual evolution must finish before the next evolution or battle participation. */
export const isPetAppearanceReady = (
  pet: Pick<UserPet, "rank" | "generationStatus" | "artRank" | "avatar">,
) =>
  pet.rank >= 1 &&
  pet.rank <= PET_RANKS.length &&
  pet.generationStatus === "READY" &&
  pet.artRank === pet.rank &&
  Boolean(pet.avatar);

export const canUsePet = (
  pet: Pick<
    UserPet,
    "rank" | "battleEnabled" | "generationStatus" | "artRank" | "avatar"
  >,
  owner: { rank: UserRank },
) =>
  pet.battleEnabled &&
  pet.rank <= getMaxPetRank(owner.rank) &&
  isPetAppearanceReady(pet);

export const getPetLevel = (pet: Pick<UserPet, "rank" | "experience">) => {
  const cap = getPetRank(pet.rank).levelCap;
  let level = 1;
  while (level < cap && pet.experience >= calcLevelRequirements(level)) level += 1;
  return level;
};

export const getPetStatCaps = (pet: Pick<UserPet, "rank">) =>
  getUserCaps(getPetRank(pet.rank).minUserRank);

export const petRankUpBlockMessage = (
  pet: Pick<UserPet, "rank" | "experience" | "generationStatus" | "artRank" | "avatar">,
  owner: { rank: UserRank },
) => {
  const next = PET_RANKS.find((entry) => entry.rank === pet.rank + 1);
  if (!next) return "Your pet has reached its highest rank.";
  if (!isPetAppearanceReady(pet))
    return "Finish your pet's current appearance before evolving again.";
  if (next.rank > getMaxPetRank(owner.rank))
    return `Reach ${next.minUserRank} before evolving to ${next.name}.`;
  if (pet.experience < next.experienceRequired)
    return `Assign ${next.experienceRequired.toLocaleString("en-US")} total experience to evolve to ${next.name}.`;
  return null;
};
