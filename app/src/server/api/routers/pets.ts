import { and, count, eq, gt, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  CombatStatNames,
  MAP_WAKE_ISLAND_SECTOR,
  PET_ABILITY_SLOT_COST,
  PET_COLLECTION_SLOT_COST,
  PET_FEED_EXPERIENCE_PER_RANK,
  PET_GENERATION_LEASE_MS,
  PET_GENERATION_RETRY_MS,
  PET_MAX_COLLECTION_SLOTS,
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
  userItem,
  userJutsu,
  userPet,
  userSkill,
  userUpload,
} from "@/drizzle/schema";
import {
  getPetAbilityCapacity,
  isPetJutsuAllowed,
  isPetSkillAllowed,
  validatePetAbilities,
} from "@/libs/pets/abilities";
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
import {
  claimUserSnapshot,
  consumeUserItemAtomically,
} from "@/server/utils/concurrency";
import { isMysqlDuplicateKeyError, retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { getPetDayKey } from "@/utils/time";
import {
  acquirePetSchema,
  assignPetExperienceSchema,
  feedPetSchema,
  petAcquisitionResponseSchema,
  petSelectionSchema,
  updatePetAbilitiesSchema,
  updatePetAiSchema,
  updatePetSchema,
} from "@/validators/pets";

export const petsRouter = createTRPCRouter({
  unlockSlot: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const { user } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      if (!user) return errorResponse("User not found");
      if (user.isBanned || user.status !== "AWAKE" || user.battleId || user.isAi)
        return errorResponse(
          "You must be awake and out of combat to unlock a companion slot.",
        );
      if (user.petSlots >= PET_MAX_COLLECTION_SLOTS)
        return errorResponse("Your companion collection has all available slots.");
      if (user.reputationPoints < PET_COLLECTION_SLOT_COST)
        return errorResponse(
          `A collection slot costs ${PET_COLLECTION_SLOT_COST} reputation points.`,
        );
      const claim = await retryOnDeadlock(() =>
        claimUserSnapshot({
          client: ctx.drizzle,
          userId: ctx.userId,
          updatedAt: user.updatedAt,
          where: [
            ...ownerMutationWhere(user),
            eq(userData.petSlots, user.petSlots),
            gte(userData.reputationPoints, PET_COLLECTION_SLOT_COST),
          ],
          set: {
            petSlots: sql`${userData.petSlots} + 1`,
            reputationPoints: sql`${userData.reputationPoints} - ${PET_COLLECTION_SLOT_COST}`,
          },
        }),
      );
      return claim.success
        ? { success: true, message: "Companion collection slot unlocked." }
        : changedResponse();
    }),

  activatePet: protectedProcedure
    .input(petSelectionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet, pets } = await fetchPetOwner(
        ctx.drizzle,
        ctx.userId,
        input.petId,
      );
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (pet.id === user.activePetId)
        return errorResponse("This companion is already active.");
      if (pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      const previous = pets.find((entry) => entry.id === user.activePetId);
      try {
        const activated = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const claim = await claimUserSnapshot({
              client: tx,
              userId: ctx.userId,
              updatedAt: user.updatedAt,
              where: ownerMutationWhere(user),
            });
            if (!claim.success) return false;
            if (previous) {
              // The owner claim holds the XP row while the bank moves with its companion.
              const parked = await tx
                .update(userPet)
                .set({
                  storedExperience: sql`(SELECT ${userData.petExperience} FROM ${userData} WHERE ${userData.userId} = ${ctx.userId})`,
                  revision: sql`${userPet.revision} + 1`,
                  updatedAt: new Date(),
                })
                .where(petSnapshotWhere(previous));
              if (parked.rowsAffected !== 1) throw petMutationConflict();
            }
            const selected = await tx
              .update(userPet)
              .set({
                storedExperience: 0,
                revision: sql`${userPet.revision} + 1`,
                updatedAt: new Date(),
              })
              .where(petSnapshotWhere(pet));
            if (selected.rowsAffected !== 1) throw petMutationConflict();
            await tx
              .update(userData)
              .set({ activePetId: pet.id, petExperience: pet.storedExperience })
              .where(eq(userData.userId, ctx.userId));
            return true;
          }),
        );
        return activated
          ? { success: true, message: `${pet.name} is now your active companion.` }
          : changedResponse();
      } catch (error) {
        if (isPetMutationConflict(error)) return changedResponse();
        throw error;
      }
    }),

  unlockAbilitySlot: protectedProcedure
    .input(petSelectionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      if (pet.abilitySlots >= getPetAbilityCapacity(pet).maxSlots)
        return errorResponse("Evolve your companion to unlock more ability slots.");
      if (user.reputationPoints < PET_ABILITY_SLOT_COST)
        return errorResponse(
          `An ability slot costs ${PET_ABILITY_SLOT_COST} reputation points.`,
        );
      const changed = await updateOwnedPet(
        ctx.drizzle,
        user,
        pet,
        { abilitySlots: pet.abilitySlots + 1 },
        PET_ABILITY_SLOT_COST,
      );
      return changed
        ? { success: true, message: "Companion ability slot unlocked." }
        : changedResponse();
    }),

  updateAbilities: protectedProcedure
    .input(updatePetAbilitiesSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [{ user, pet }, abilities] = await Promise.all([
        fetchPetOwner(ctx.drizzle, ctx.userId, input.petId),
        fetchPetAbilities(ctx.drizzle, ctx.userId),
      ]);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      const blocked = validatePetAbilities({
        pet: { ...pet, jutsuIds: input.jutsuIds, skillIds: input.skillIds },
        owner: user,
        ...abilities,
      });
      if (blocked) return errorResponse(blocked);
      const changed = await updateOwnedPet(ctx.drizzle, user, pet, {
        jutsuIds: input.jutsuIds,
        skillIds: input.skillIds,
      });
      return changed
        ? { success: true, message: "Companion abilities updated." }
        : changedResponse();
    }),

  feedPet: protectedProcedure
    .input(feedPetSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [{ user, pet }, meal] = await Promise.all([
        fetchPetOwner(ctx.drizzle, ctx.userId, input.petId),
        ctx.drizzle.query.userItem.findFirst({
          where: and(
            eq(userItem.id, input.userItemId),
            eq(userItem.userId, ctx.userId),
          ),
          with: { item: true },
        }),
      ]);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      if (!isPetAppearanceReady(pet))
        return errorResponse("Finish your companion's appearance before feeding it.");
      const dayKey = getPetDayKey();
      if (pet.feedDay === dayKey)
        return errorResponse(
          "This companion has already been fed today. Return after midnight UTC.",
        );
      if (
        !meal ||
        meal.item.itemType !== "MEAL" ||
        meal.storedAtHome ||
        meal.isInAuction ||
        meal.equipped !== "NONE" ||
        (meal.craftingFinishedAt && meal.craftingFinishedAt > new Date())
      )
        return errorResponse(
          "Carry a finished meal in your inventory to feed your companion.",
        );
      if (input.expectedQuantity !== meal.quantity || meal.quantity <= 0)
        return errorResponse("Your meal stack changed. Refresh and try again.");
      const experience = pet.rank * PET_FEED_EXPERIENCE_PER_RANK;
      const isActive = user.activePetId === pet.id;
      try {
        const fed = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const claim = await claimUserSnapshot({
              client: tx,
              userId: ctx.userId,
              updatedAt: user.updatedAt,
              where: ownerMutationWhere(user),
              set: isActive
                ? { petExperience: sql`${userData.petExperience} + ${experience}` }
                : {},
            });
            if (!claim.success) return false;
            const consumed = await consumeUserItemAtomically({
              client: tx,
              userId: ctx.userId,
              userItemId: meal.id,
              expectedQuantity: meal.quantity,
              where: [
                eq(userItem.isInAuction, false),
                eq(userItem.storedAtHome, false),
                eq(userItem.equipped, "NONE"),
                or(
                  isNull(userItem.craftingFinishedAt),
                  lt(userItem.craftingFinishedAt, new Date()),
                ),
              ],
            });
            if (!consumed) throw petMutationConflict();
            const result = await tx
              .update(userPet)
              .set({
                feedDay: dayKey,
                ...(!isActive
                  ? {
                      storedExperience: sql`${userPet.storedExperience} + ${experience}`,
                    }
                  : {}),
                revision: sql`${userPet.revision} + 1`,
                updatedAt: new Date(),
              })
              .where(petSnapshotWhere(pet));
            if (result.rowsAffected !== 1) throw petMutationConflict();
            return true;
          }),
        );
        return fed
          ? {
              success: true,
              message: `${pet.name} enjoyed its meal and gained ${experience.toLocaleString("en-US")} companion experience.`,
            }
          : changedResponse();
      } catch (error) {
        if (isPetMutationConflict(error)) return changedResponse();
        throw error;
      }
    }),

  getCollection: protectedProcedure.query(async ({ ctx }) => {
    const { user, pets } = await fetchPetOwner(ctx.drizzle, ctx.userId);
    if (!user) throw serverError("NOT_FOUND", "User not found");
    return { pets: pets.map(omitGenerationToken), activePetId: user.activePetId };
  }),

  getPet: protectedProcedure
    .input(petSelectionSchema.optional())
    .query(async ({ ctx, input }) => {
      const [{ user, pet, pets }, abilities, meals] = await Promise.all([
        fetchPetOwner(ctx.drizzle, ctx.userId, input?.petId),
        fetchPetAbilities(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.userItem.findMany({
          where: and(
            eq(userItem.userId, ctx.userId),
            gt(userItem.quantity, 0),
            eq(userItem.storedAtHome, false),
            eq(userItem.isInAuction, false),
            eq(userItem.equipped, "NONE"),
            or(
              isNull(userItem.craftingFinishedAt),
              lt(userItem.craftingFinishedAt, new Date()),
            ),
          ),
          with: { item: true },
        }),
      ]);
      if (!user) throw serverError("NOT_FOUND", "User not found");
      const now = new Date();
      const dayKey = getPetDayKey(now);
      const acquisitionRestriction =
        user.petSlots <= pets.length
          ? "Unlock another collection slot or release a companion before adopting another."
          : acquisitionBlockMessage(user);
      const rankUpReason = pet
        ? (petMutationBlockMessage(user, pet) ?? petRankUpBlockMessage(pet, user))
        : "Adopt a pet first.";
      const attempts = pet?.generationDay === dayKey ? pet.generationAttempts : 0;
      // A generation token is server-only; the UI needs its status and retry time instead.
      const visiblePet = pet ? omitGenerationToken(pet) : null;
      return {
        pet: visiblePet,
        pets: pets.map(omitGenerationToken),
        activePetId: user.activePetId,
        slots: user.petSlots,
        maxSlots: PET_MAX_COLLECTION_SLOTS,
        slotCost: PET_COLLECTION_SLOT_COST,
        abilities: {
          jutsus: abilities.jutsus.filter(isPetJutsuAllowed),
          skills: abilities.skills.filter(isPetSkillAllowed),
        },
        abilityCapacity: pet ? getPetAbilityCapacity(pet) : null,
        abilitySlotCost: PET_ABILITY_SLOT_COST,
        feedMeals: meals
          .filter((meal) => meal.item.itemType === "MEAL")
          .map((meal) => ({
            id: meal.id,
            quantity: meal.quantity,
            name: meal.item.name,
          })),
        feedExperience: pet ? pet.rank * PET_FEED_EXPERIENCE_PER_RANK : 0,
        canFeed: Boolean(
          pet &&
            pet.feedDay !== dayKey &&
            !petMutationBlockMessage(user, pet) &&
            isPetAppearanceReady(pet) &&
            pet.rank <= getMaxPetRank(user.rank),
        ),
        options: getDailyPetOptions(user.userId, user.federalStatus, dayKey),
        dayKey,
        optionCount: PET_OPTION_COUNTS[user.federalStatus],
        replacementCost: user.petAcquisitions === 0 ? 0 : PET_REPLACEMENT_COST,
        canAcquire: !acquisitionRestriction,
        unavailableReason: acquisitionRestriction,
        unusedExperience:
          pet?.id === user.activePetId
            ? user.petExperience
            : (pet?.storedExperience ?? 0),
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
    .output(petAcquisitionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { user, pets } = await fetchPetOwner(ctx.drizzle, ctx.userId);
      if (!user) return errorResponse("User not found");
      const restriction = acquisitionBlockMessage(user);
      if (restriction) return errorResponse(restriction);
      if (pets.length >= user.petSlots)
        return errorResponse(
          "Unlock another collection slot or release a companion before adopting another.",
        );
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
      const petId = nanoid();
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
                eq(userData.petSlots, user.petSlots),
                lt(
                  tx
                    .select({ count: count() })
                    .from(userPet)
                    .where(eq(userPet.userId, user.userId)),
                  userData.petSlots,
                ),
                gte(userData.reputationPoints, cost),
              ],
              set: {
                ...(!user.activePetId ? { activePetId: petId, petExperience: 0 } : {}),
                petAcquisitions: sql`${userData.petAcquisitions} + 1`,
                reputationPoints: sql`${userData.reputationPoints} - ${cost}`,
              },
            });
            if (!claim.success) return false;
            await tx.insert(userPet).values({
              id: petId,
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
          petId,
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
    .input(petSelectionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
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
              set:
                user.activePetId === pet.id
                  ? { petExperience: 0, activePetId: null }
                  : {},
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
                "Your companion returned to the sanctuary. Its progress and unused experience were removed.",
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
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      if (input.battleEnabled && pet.rank > getMaxPetRank(user.rank))
        return errorResponse("Your rank does not support this companion rank.");
      const { petId: _petId, ...patch } = input;
      const changed = await updateOwnedPet(ctx.drizzle, user, pet, patch);
      return changed
        ? { success: true, message: "Companion settings updated." }
        : changedResponse();
    }),

  updateAiConfig: protectedProcedure
    .input(updatePetAiSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
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
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
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
      ) as Record<(typeof CombatStatNames)[number], number>;
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
      const isActive = user.activePetId === pet.id;
      if (spent > (isActive ? user.petExperience : pet.storedExperience))
        return errorResponse("Not enough unused companion experience.");
      try {
        const assigned = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const claim = await claimUserSnapshot({
              client: tx,
              userId: user.userId,
              updatedAt: user.updatedAt,
              where: [
                ...ownerMutationWhere(user),
                ...(isActive ? [gte(userData.petExperience, spent)] : []),
              ],
              set: isActive
                ? { petExperience: sql`${userData.petExperience} - ${spent}` }
                : {},
            });
            if (!claim.success) return false;
            const result = await tx
              .update(userPet)
              .set({
                ...stats,
                ...(!isActive
                  ? { storedExperience: sql`${userPet.storedExperience} - ${spent}` }
                  : {}),
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

  rankUp: protectedProcedure
    .input(petSelectionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
      const restriction = petMutationBlockMessage(user, pet);
      if (restriction || !user || !pet)
        return errorResponse(restriction ?? "Pet not found");
      const blocked = petRankUpBlockMessage(pet, user);
      if (blocked) return errorResponse(blocked);
      const next = PET_RANKS.find((entry) => entry.rank === pet.rank + 1);
      if (!next) return errorResponse("Your pet has reached its highest rank.");
      const attempts =
        pet.generationDay === getPetDayKey() ? pet.generationAttempts : 0;
      if (attempts >= PET_MAX_GENERATION_ATTEMPTS)
        return errorResponse(
          `You have used today's ${PET_MAX_GENERATION_ATTEMPTS} generation attempts. Retry tomorrow; your companion is still yours.`,
        );
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
    .input(petSelectionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
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

const fetchPetOwner = async (client: DrizzleClient, userId: string, petId?: string) => {
  const [user, pets] = await Promise.all([
    client.query.userData.findFirst({ where: eq(userData.userId, userId) }),
    client.query.userPet.findMany({
      where: eq(userPet.userId, userId),
      orderBy: userPet.createdAt,
    }),
  ]);
  const pet =
    pets.find((entry) => entry.id === (petId ?? user?.activePetId)) ??
    (!petId ? pets[0] : undefined);
  return { user, pet, pets };
};

const fetchPetAbilities = async (client: DrizzleClient, userId: string) => {
  const [jutsus, skills] = await Promise.all([
    client.query.userJutsu.findMany({
      where: eq(userJutsu.userId, userId),
      with: { jutsu: true },
    }),
    client.query.userSkill.findMany({
      where: and(eq(userSkill.userId, userId), eq(userSkill.activated, true)),
      with: { skill: true },
    }),
  ]);
  return {
    jutsus: jutsus.map((owned) => owned.jutsu),
    skills: skills.map((owned) => owned.skill),
  };
};

const omitGenerationToken = ({ generationToken: _generationToken, ...pet }: UserPet) =>
  pet;

const acquisitionBlockMessage = (user: UserData) => {
  if (user.isBanned) return "You are banned";
  if (user.status !== "AWAKE" || user.battleId)
    return "You must be awake and out of combat to adopt a companion.";
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
  if (user.status !== "AWAKE" || user.battleId)
    return "You must be awake and out of combat to change your companion.";
  return null;
};

const hasActiveGeneration = (pet: UserPet, now = new Date()) =>
  pet.generationStatus === "GENERATING" &&
  (!pet.generationStartedAt ||
    now.getTime() - pet.generationStartedAt.getTime() < PET_GENERATION_LEASE_MS);
const ownerMutationWhere = (user: UserData) => [
  eq(userData.status, "AWAKE"),
  eq(userData.isBanned, false),
  isNull(userData.battleId),
  user.activePetId
    ? eq(userData.activePetId, user.activePetId)
    : isNull(userData.activePetId),
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
  cost = 0,
) => {
  try {
    return await retryOnDeadlock(() =>
      client.transaction(async (tx) => {
        const claim = await claimUserSnapshot({
          client: tx,
          userId: user.userId,
          updatedAt: user.updatedAt,
          where: [...ownerMutationWhere(user), gte(userData.reputationPoints, cost)],
          set: cost
            ? { reputationPoints: sql`${userData.reputationPoints} - ${cost}` }
            : {},
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
