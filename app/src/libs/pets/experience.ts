import { sql } from "drizzle-orm";
import { UserRanks } from "@/drizzle/constants";
import { userData, userPet } from "@/drizzle/schema";
import { getMaxPetRank } from "@/libs/pets/progression";

/** Credit new player XP to the accompanying pet in the same guarded owner update. */
export const petExperienceGainSql = (experience: number, petId?: string | null) => {
  if (!Number.isFinite(experience) || experience <= 0 || petId === null)
    return sql`${userData.petExperience}`;
  // Player XP columns store whole points; mirror the committed grant rather than
  // accumulate fractional training gains that the player's integer column rounds.
  const gain = Math.round(experience);
  const maxRank = sql`CASE ${userData.rank} ${sql.join(
    UserRanks.map((rank) => sql`WHEN ${rank} THEN ${getMaxPetRank(rank)}`),
    sql` `,
  )} ELSE 0 END`;
  const identity = petId ? sql`AND ${userPet.id} = ${petId}` : sql``;
  // The live identity guard excludes released/replaced pets, while the correlated
  // rank check also stops progression after the owner loses the required rank.
  return sql`${userData.petExperience} + IF(EXISTS (
    SELECT 1 FROM ${userPet}
    WHERE ${userPet.userId} = ${userData.userId}
      AND ${userPet.id} = ${userData.activePetId}
      AND ${userPet.battleEnabled} = true
      AND ${userPet.generationStatus} = 'READY'
      AND ${userPet.artRank} = ${userPet.rank}
      AND ${userPet.avatar} IS NOT NULL AND ${userPet.avatar} <> ''
      AND ${userPet.rank} <= ${maxRank}
      AND ${userPet.rank} >= 1
      ${identity}
  ), ${gain}, 0)`;
};
