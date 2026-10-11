import { and, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  CombatStatNames,
  MAP_WAKE_ISLAND_SECTOR,
  PET_GENERATION_LEASE_MS,
  PET_GENERATION_RETRY_MS,
  PET_MAX_GENERATION_ATTEMPTS,
  PET_OPTION_COUNTS,
  PET_RANKS,
  PET_REPLACEMENT_COST,
  PET_SANCTUARY_NAME,
} from "@/drizzle/constants";
import {
  type UserData,
  type UserPet,
  userData,
  userPet,
  userUpload,
} from "@/drizzle/schema";
import { generatePetAppearance } from "@/libs/pets/appearance";
import { getDailyPetOptions, isAvailablePetAppearance } from "@/libs/pets/catalogue";
import {
  getMaxPetRank,
  getPetStatCaps,
  isPetAppearanceReady,
  petRankUpBlockMessage,
} from "@/libs/pets/progression";
import { getAssignedCombatStatTotal } from "@/libs/profile";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
  serverError,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { claimUserSnapshot } from "@/server/utils/concurrency";
import { isMysqlDuplicateKeyError, retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { getPetDayKey } from "@/utils/time";
import {
  acquirePetSchema,
  assignPetExperienceSchema,
  updatePetAiSchema,
  updatePetSchema,
} from "@/validators/pets";

export const petsRouter = createTRPCRouter({
  getPet: protectedProcedure.query(async ({ ctx }) => {
    const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
    if (!user) throw serverError("NOT_FOUND", "User not found");
    const now = new Date();
    const dayKey = getPetDayKey(now);
    const acquisitionRestriction = pet
      ? "Release your current companion before adopting another."
      : acquisitionBlockMessage(user);
    const rankUpReason = pet
      ? (petMutationBlockMessage(user, pet) ?? petRankUpBlockMessage(pet, user))
      : "Adopt a pet first.";
    const attempts = pet?.generationDay === dayKey ? pet.generationAttempts : 0;
    // A generation token is server-only; the UI needs its status and retry time instead.
    const visiblePet = pet ? omitGenerationToken(pet) : null;
    return {
      pet: visiblePet,
      options: getDailyPetOptions(user.userId, user.federalStatus, dayKey),
      dayKey,
      optionCount: PET_OPTION_COUNTS[user.federalStatus],
      replacementCost: user.petAcquisitions === 0 ? 0 : PET_REPLACEMENT_COST,
      canAcquire: !acquisitionRestriction,
      unavailableReason: acquisitionRestriction,
      unusedExperience: user.petExperience,
      nextRank: pet
        ? (PET_RANKS.find((rank) => rank.rank === pet.rank + 1) ?? null)
        : null,
      maxRank: getMaxPetRank(user.rank),
      canRankUp: Boolean(pet) && !rankUpReason,
      rankUpReason,
      generationLimit: PET_MAX_GENERATION_ATTEMPTS,
      remainingGenerations: Math.max(0, PET_MAX_GENERATION_ATTEMPTS - attempts),
      generationRetryAt: pet?.generationStartedAt
        ? new Date(
            pet.generationStartedAt.getTime() +
              (pet.generationStatus === "GENERATING"
                ? PET_GENERATION_LEASE_MS
                : PET_GENERATION_RETRY_MS),
          )
        : null,
    };
  }),

  acquirePet: protectedProcedure
    .input(acquirePetSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      if (!user) return errorResponse("User not found");
      const restriction = acquisitionBlockMessage(user);
      if (restriction) return errorResponse(restriction);
      if (pet)
        return errorResponse("Release your current companion before adopting another.");
      const dayKey = getPetDayKey();
      if (input.dayKey !== dayKey)
        return errorResponse(
          "Today's companion choices changed. Refresh and choose again.",
        );
      if (
        !isAvailablePetAppearance(
          input,
          getDailyPetOptions(user.userId, user.federalStatus, dayKey),
        )
      )
        return errorResponse("Choose from your available companion traits for today.");
      const cost = user.petAcquisitions === 0 ? 0 : PET_REPLACEMENT_COST;
      if (user.reputationPoints < cost)
        return errorResponse(`Replacing a companion costs ${cost} reputation points.`);
      try {
        const acquired = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const claim = await claimUserSnapshot({
              client: tx,
              userId: user.userId,
              updatedAt: user.updatedAt,
              where: [
                ...ownerMutationWhere(user),
                eq(userData.isAi, false),
                eq(userData.sector, MAP_WAKE_ISLAND_SECTOR),
                eq(userData.federalStatus, user.federalStatus),
                eq(userData.petAcquisitions, user.petAcquisitions),
                gte(userData.reputationPoints, cost),
              ],
              set: {
                petExperience: 0,
                petAcquisitions: sql`${userData.petAcquisitions} + 1`,
                reputationPoints: sql`${userData.reputationPoints} - ${cost}`,
              },
            });
            if (!claim.success) return false;
            await tx.insert(userPet).values({
              id: nanoid(),
              userId: user.userId,
              name: input.name,
              speciesIndex: input.speciesIndex,
              paletteIndex: input.paletteIndex,
              characteristicIndex: input.characteristicIndex,
              auraIndex: input.auraIndex,
            });
            return true;
          }),
        );
        if (!acquired) return changedResponse();
        return {
          success: true,
          message: cost
            ? `Companion adopted for ${cost} reputation points. Its appearance is ready to generate.`
            : "Your first companion is adopted free. Its appearance is ready to generate.",
        };
      } catch (error) {
        if (isPetMutationConflict(error) || isMysqlDuplicateKeyError(error))
          return changedResponse();
        throw error;
      }
    }),

  releasePet: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (hasActiveGeneration(pet))
        return errorResponse(
          "Wait for your pet's appearance to finish before releasing it.",
        );
      try {
        const released = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const claim = await claimUserSnapshot({
              client: tx,
              userId: user.userId,
              updatedAt: user.updatedAt,
              where: ownerMutationWhere(user),
              set: { petExperience: 0 },
            });
            if (!claim.success) return false;
            const removed = await tx.delete(userPet).where(petSnapshotWhere(pet));
            if (removed.rowsAffected !== 1) throw petMutationConflict();
            return true;
          }),
        );
        return released
          ? {
              success: true,
              message:
                "Your companion returned to the sanctuary. All pet experience was reset.",
            }
          : changedResponse();
      } catch (error) {
        if (isPetMutationConflict(error)) return changedResponse();
        throw error;
      }
    }),

  updatePet: protectedProcedure
    .input(updatePetSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (input.battleEnabled && pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      const changed = await updateOwnedPet(ctx.drizzle, user, pet, input);
      return changed
        ? { success: true, message: "Companion settings updated." }
        : changedResponse();
    }),

  updateAiConfig: protectedProcedure
    .input(updatePetAiSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      const changed = await updateOwnedPet(ctx.drizzle, user, pet, {
        aiRules: input.rules,
        includeDefaultRules: input.includeDefaultRules,
      });
      return changed
        ? { success: true, message: "Companion AI settings updated." }
        : changedResponse();
    }),

  assignExperience: protectedProcedure
    .input(assignPetExperienceSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      if (!isPetAppearanceReady(pet))
        return errorResponse(
          "Finish your pet's appearance before assigning experience.",
        );
      const { stats_cap, gens_cap } = getPetStatCaps(pet);
      const gains = Object.fromEntries(
        CombatStatNames.map((stat) => [stat, Math.floor(input[stat])]),
      ) as typeof input;
      if (CombatStatNames.every((stat) => gains[stat] === 0))
        return errorResponse("Select some stats to train.");
      const stats = {
        offence: pet.offence,
        defence: pet.defence,
        strength: pet.strength,
        speed: pet.speed,
        intelligence: pet.intelligence,
        willpower: pet.willpower,
      };
      for (const stat of CombatStatNames) {
        const cap = stat === "offence" || stat === "defence" ? stats_cap : gens_cap;
        if (stats[stat] + gains[stat] > cap)
          return errorResponse("One or more companion stats exceed this rank's cap.");
        stats[stat] += gains[stat];
      }
      const spent = getAssignedCombatStatTotal(stats) - getAssignedCombatStatTotal(pet);
      if (spent > user.petExperience)
        return errorResponse("Not enough unused companion experience.");
      try {
        const assigned = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const claim = await claimUserSnapshot({
              client: tx,
              userId: user.userId,
              updatedAt: user.updatedAt,
              where: [...ownerMutationWhere(user), gte(userData.petExperience, spent)],
              set: { petExperience: sql`${userData.petExperience} - ${spent}` },
            });
            if (!claim.success) return false;
            const result = await tx
              .update(userPet)
              .set({
                ...stats,
                experience: sql`${userPet.experience} + ${spent}`,
                revision: sql`${userPet.revision} + 1`,
                updatedAt: new Date(),
              })
              .where(petSnapshotWhere(pet));
            if (result.rowsAffected !== 1) throw petMutationConflict();
            return true;
          }),
        );
        return assigned
          ? {
              success: true,
              message: `${spent.toLocaleString("en-US")} companion experience assigned.`,
            }
          : changedResponse();
      } catch (error) {
        if (isPetMutationConflict(error)) return changedResponse();
        throw error;
      }
    }),

  rankUp: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
    const restriction = petMutationBlockMessage(user, pet);
    if (restriction || !user || !pet)
      return errorResponse(restriction ?? "Pet not found");
    const blocked = petRankUpBlockMessage(pet, user);
    if (blocked) return errorResponse(blocked);
    const next = PET_RANKS.find((entry) => entry.rank === pet.rank + 1);
    if (!next) return errorResponse("Your pet has reached its highest rank.");
    const changed = await updateOwnedPet(ctx.drizzle, user, pet, {
      rank: next.rank,
      generationStatus: "PENDING",
      generationToken: null,
      generationStartedAt: null,
    });
    return changed
      ? {
          success: true,
          message: `Your companion is now ${next.name}. Generate its evolved appearance to return it to battle.`,
        }
      : changedResponse();
  }),

  generateAppearance: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      if (!user || !pet) return errorResponse("Pet not found");
      if (user.isBanned) return errorResponse("You are banned");
      if (pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      if (isPetAppearanceReady(pet))
        return errorResponse("This companion already has its current appearance.");
      const now = new Date();
      const dayKey = getPetDayKey(now);
      if (hasActiveGeneration(pet, now))
        return errorResponse(
          "Your companion's appearance is already generating. Please wait.",
        );
      if (
        pet.generationStartedAt &&
        now.getTime() - pet.generationStartedAt.getTime() < PET_GENERATION_RETRY_MS
      )
        return errorResponse(
          "Please wait a moment before retrying your companion's appearance.",
        );
      const attempts = pet.generationDay === dayKey ? pet.generationAttempts : 0;
      if (attempts >= PET_MAX_GENERATION_ATTEMPTS)
        return errorResponse(
          `You have used today's ${PET_MAX_GENERATION_ATTEMPTS} generation attempts. Retry tomorrow; your companion is still yours.`,
        );
      const token = nanoid();
      const claim = await retryOnDeadlock(() =>
        ctx.drizzle
          .update(userPet)
          .set({
            generationStatus: "GENERATING",
            generationToken: token,
            generationStartedAt: now,
            generationDay: dayKey,
            generationAttempts: attempts + 1,
            revision: sql`${userPet.revision} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              petSnapshotWhere(pet),
              or(
                ne(userPet.generationStatus, "READY"),
                ne(userPet.artRank, userPet.rank),
                isNull(userPet.avatar),
              ),
              sql`EXISTS (SELECT 1 FROM ${userData} WHERE ${userData.userId} = ${ctx.userId} AND ${userData.isBanned} = false AND ${userData.rank} = ${user.rank})`,
            ),
          ),
      );
      if (claim.rowsAffected !== 1) return changedResponse();
      try {
        const avatar = await generatePetAppearance(pet, async (imageUrl) => {
          await ctx.drizzle
            .insert(userUpload)
            .values({ id: nanoid(), userId: ctx.userId, imageUrl });
        });
        const accepted = await retryOnDeadlock(() =>
          ctx.drizzle
            .update(userPet)
            .set({
              avatar,
              avatarFacing: "left",
              artRank: pet.rank,
              generationStatus: "READY",
              generationToken: null,
              revision: sql`${userPet.revision} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userPet.id, pet.id),
                eq(userPet.userId, ctx.userId),
                eq(userPet.rank, pet.rank),
                eq(userPet.generationToken, token),
                eq(userPet.generationStatus, "GENERATING"),
              ),
            ),
        );
        if (accepted.rowsAffected !== 1)
          return errorResponse(
            "The companion changed before the image completed. Refresh to see its current appearance.",
          );
        return { success: true, message: "Your companion's appearance is ready." };
      } catch (error) {
        console.error("Companion appearance generation failed", {
          petId: pet.id,
          rank: pet.rank,
          error,
        });
        await retryOnDeadlock(() =>
          ctx.drizzle
            .update(userPet)
            .set({
              generationStatus: "FAILED",
              generationToken: null,
              revision: sql`${userPet.revision} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userPet.id, pet.id),
                eq(userPet.userId, ctx.userId),
                eq(userPet.generationToken, token),
                eq(userPet.generationStatus, "GENERATING"),
              ),
            ),
        );
        return errorResponse(
          "The appearance could not be generated or verified. Your companion is kept and retrying never charges adoption again.",
        );
      }
    }),
});

const fetchPetOwner = async (client: DrizzleClient, userId: string) => {
  const [user, pet] = await Promise.all([
    client.query.userData.findFirst({ where: eq(userData.userId, userId) }),
    client.query.userPet.findFirst({ where: eq(userPet.userId, userId) }),
  ]);
  return { user, pet };
};

const omitGenerationToken = ({ generationToken: _generationToken, ...pet }: UserPet) =>
  pet;

const acquisitionBlockMessage = (user: UserData) => {
  if (user.isBanned) return "You are banned";
  if (user.status !== "AWAKE") return "You must be awake to adopt a companion.";
  if (user.isAi || getMaxPetRank(user.rank) === 0)
    return "Only player characters can adopt a companion.";
  if (user.sector !== MAP_WAKE_ISLAND_SECTOR)
    return `Visit ${PET_SANCTUARY_NAME} on Wake Island to adopt a companion.`;
  return null;
};

const petMutationBlockMessage = (
  user: UserData | undefined,
  pet: UserPet | undefined,
) => {
  if (!user) return "User not found";
  if (!pet) return "Pet not found";
  if (user.isBanned) return "You are banned";
  if (user.status !== "AWAKE") return "You must be awake to change your companion.";
  return null;
};

const hasActiveGeneration = (pet: UserPet, now = new Date()) =>
  pet.generationStatus === "GENERATING" &&
  (!pet.generationStartedAt ||
    now.getTime() - pet.generationStartedAt.getTime() < PET_GENERATION_LEASE_MS);
const ownerMutationWhere = (user: UserData) => [
  eq(userData.status, "AWAKE"),
  eq(userData.isBanned, false),
  eq(userData.rank, user.rank),
];
const petSnapshotWhere = (pet: UserPet) =>
  and(
    eq(userPet.id, pet.id),
    eq(userPet.userId, pet.userId),
    eq(userPet.revision, pet.revision),
  );
const changedResponse = () =>
  errorResponse("Your character or companion changed. Refresh and try again.");

/** A pet write losing its snapshot must roll back its paired character debit. */
const petMutationConflict = () =>
  Object.assign(new Error("Companion snapshot changed"), {
    name: "PetMutationConflict",
  });
const isPetMutationConflict = (error: unknown) =>
  error instanceof Error && error.name === "PetMutationConflict";

const updateOwnedPet = async (
  client: DrizzleClient,
  user: UserData,
  pet: UserPet,
  patch: Partial<UserPet>,
) => {
  try {
    return await retryOnDeadlock(() =>
      client.transaction(async (tx) => {
        const claim = await claimUserSnapshot({
          client: tx,
          userId: user.userId,
          updatedAt: user.updatedAt,
          where: ownerMutationWhere(user),
          set: {},
        });
        if (!claim.success) return false;
        const result = await tx
          .update(userPet)
          .set({
            ...patch,
            revision: sql`${userPet.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(petSnapshotWhere(pet));
        if (result.rowsAffected !== 1) throw petMutationConflict();
        return true;
      }),
    );
  } catch (error) {
    if (isPetMutationConflict(error)) return false;
    throw error;
  }
};
