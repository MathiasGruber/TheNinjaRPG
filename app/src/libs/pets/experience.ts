/** SQL-side eligibility and increments for the active companion's unassigned XP bank. */
import { sql } from "drizzle-orm";
import { UserRanks } from "@/drizzle/constants";
import { userData, userPet } from "@/drizzle/schema";
import { getMaxPetRank } from "@/libs/pets/progression";

/**
 * Add newly awarded player XP in the caller's guarded owner update, using live
 * pet eligibility rather than a stale read. Omit petId to use the current active
 * pet, pass an ID to bind battle rewards to its original companion, or pass null
 * to award no pet XP. Assigning already earned player XP must not call this again.
 */
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
      AND ${userPet.generationStatus} IN ('READY', 'GENERATING')
      AND ${userPet.artRank} = ${userPet.rank}
      AND ${userPet.avatar} IS NOT NULL AND ${userPet.avatar} <> ''
      AND ${userPet.rank} <= ${maxRank}
      AND ${userPet.rank} >= 1
      AND (${userData.petTask} IS NULL OR
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${userData.petTask}, '$.petId')), '') <> ${userPet.id})
      ${identity}
  ), ${gain}, 0)`;
};
