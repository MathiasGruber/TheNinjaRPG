import * as Sentry from "@sentry/nextjs";
import { and, count, eq, exists, gt, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
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
  petSpecies,
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
import { claimUserSnapshot, getNextUserSnapshotAt } from "@/server/utils/concurrency";
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

/** Own, configure and progress companions through guarded account and pet snapshots. */
export const petsRouter = createTRPCRouter({
  /** Buy collection capacity and debit its price in one account update. */
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

  /** Move both unused XP banks with their companions when changing the active selection. */
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
      if (user.activePetId && !previous) return changedResponse();
      const now = new Date();
      const previousPet = alias(userPet, "previous_pet");
      // LIMIT materializes the locking snapshot, preserving XP earned before this
      // statement independently of MySQL's unspecified multi-table assignment order.
      const ownerSnapshot = ctx.drizzle
        .select({ userId: userData.userId, petExperience: userData.petExperience })
        .from(userData)
        .where(ownerSnapshotWhere(user))
        .limit(1)
        .for("update")
        .as("owner_snapshot");
      // Drizzle's MySQL UPDATE builder cannot update the owner and both pets together.
      const activated = await retryOnDeadlock(() =>
        ctx.drizzle.execute(sql`
          UPDATE ${userData}
          INNER JOIN ${ownerSnapshot} ON ${eq(userData.userId, ownerSnapshot.userId)}
          INNER JOIN ${userPet} ON ${eq(userPet.userId, userData.userId)}
          ${previous ? sql`INNER JOIN ${userPet} previous_pet ON ${and(eq(previousPet.id, previous.id), eq(previousPet.userId, userData.userId), eq(previousPet.revision, previous.revision))}` : sql``}
          SET ${userData.activePetId} = ${pet.id},
              ${userData.petExperience} = ${pet.storedExperience},
              ${userData.updatedAt} = ${getNextUserSnapshotAt(user.updatedAt, now)},
              ${userPet.storedExperience} = 0,
              ${userPet.revision} = ${userPet.revision} + 1,
              ${userPet.updatedAt} = ${now}
              ${previous ? sql`, ${previousPet.storedExperience} = ${ownerSnapshot.petExperience}, ${previousPet.revision} = ${previousPet.revision} + 1, ${previousPet.updatedAt} = ${now}` : sql``}
          WHERE ${and(ownerSnapshotWhere(user), petSnapshotWhere(pet))}
        `),
      );
      return activated.rowsAffected > 0
        ? { success: true, message: `${pet.name} is now your active companion.` }
        : changedResponse();
    }),

  /** Purchase a rank-supported ability slot together with its reputation debit. */
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

  /** Equip owned abilities after validating the companion's shared capacity and budget. */
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

  /** Exchange one carried meal for the companion's once-per-UTC-day XP grant. */
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
        meal?.item.itemType !== "MEAL" ||
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
      const now = new Date();
      // One joined UPDATE guards the account, pet and exact meal stack before any
      // debit or XP grant. Zero quantities are harmless tombstones until cleanup.
      const fed = await retryOnDeadlock(() =>
        ctx.drizzle.execute(sql`
          UPDATE ${userData}
          INNER JOIN ${userPet} ON ${eq(userPet.userId, userData.userId)}
          INNER JOIN ${userItem} ON ${eq(userItem.userId, userData.userId)}
          SET ${userData.updatedAt} = ${getNextUserSnapshotAt(user.updatedAt, now)},
              ${userItem.quantity} = ${meal.quantity - 1},
              ${userPet.feedDay} = ${dayKey},
              ${userPet.revision} = ${userPet.revision} + 1,
              ${userPet.updatedAt} = ${now},
              ${isActive ? sql`${userData.petExperience} = ${userData.petExperience} + ${experience}` : sql`${userPet.storedExperience} = ${userPet.storedExperience} + ${experience}`}
          WHERE ${and(ownerSnapshotWhere(user), petSnapshotWhere(pet))}
            AND ${userItem.id} = ${meal.id}
            AND ${userItem.userId} = ${ctx.userId}
            AND ${userItem.itemId} = ${meal.itemId}
            AND ${userItem.quantity} = ${meal.quantity}
            AND ${userItem.quantity} > 0
            AND ${userItem.isInAuction} = FALSE
            AND ${userItem.storedAtHome} = FALSE
            AND ${userItem.equipped} = 'NONE'
            AND (${userItem.craftingFinishedAt} IS NULL OR ${userItem.craftingFinishedAt} <= ${now})
        `),
      );
      if (fed.rowsAffected === 0) return changedResponse();
      if (meal.quantity === 1) {
        try {
          await retryOnDeadlock(() =>
            ctx.drizzle
              .delete(userItem)
              .where(
                and(
                  eq(userItem.id, meal.id),
                  eq(userItem.userId, ctx.userId),
                  eq(userItem.quantity, 0),
                ),
              ),
          );
        } catch (error) {
          // The feed already committed; inventory hides zero stacks and its cleaner
          // reclaims them. Report success so a cleanup failure cannot repeat the grant.
          Sentry.captureException(error, {
            level: "warning",
            tags: { source: "feedPet" },
          });
        }
      }
      return {
        success: true,
        message: `${pet.name} enjoyed its meal and gained ${experience.toLocaleString("en-US")} companion experience.`,
      };
    }),

  /** Return the owner's collection without exposing server-only generation tokens. */
  getCollection: protectedProcedure.query(async ({ ctx }) => {
    const { user, pets } = await fetchPetOwner(ctx.drizzle, ctx.userId);
    if (!user) throw serverError("NOT_FOUND", "User not found");
    return { pets: pets.map(omitGenerationToken), activePetId: user.activePetId };
  }),

  /** Assemble companion progression, abilities, meals and daily sanctuary choices. */
  getPet: protectedProcedure
    .input(petSelectionSchema.optional())
    .query(async ({ ctx, input }) => {
      const [{ user, pet, pets }, abilities, species, meals] = await Promise.all([
        fetchPetOwner(ctx.drizzle, ctx.userId, input?.petId),
        fetchPetAbilities(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.petSpecies.findMany(),
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
      const acquisitionRestriction = !species.some((entry) => entry.isActive)
        ? "The Bondkeepers are not offering new companions right now. Please check back later."
        : user.petSlots <= pets.length
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
        options: getDailyPetOptions(user.userId, user.federalStatus, species, dayKey),
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

  /** Adopt the first companion free, then charge each additional adoption exactly once. */
  acquirePet: protectedProcedure
    .input(acquirePetSchema)
    .output(petAcquisitionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const [{ user, pets }, species] = await Promise.all([
        fetchPetOwner(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.petSpecies.findMany(),
      ]);
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
          getDailyPetOptions(user.userId, user.federalStatus, species, dayKey),
        )
      )
        return errorResponse("Choose from your available companion traits for today.");
      const cost = user.petAcquisitions === 0 ? 0 : PET_REPLACEMENT_COST;
      if (user.reputationPoints < cost)
        return errorResponse(`Replacing a companion costs ${cost} reputation points.`);
      const petId = nanoid();
      try {
        // MySQL cannot insert the pet and update its owner's debit/counters/first
        // selection in one statement. Keep this transaction to those paired writes.
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
                // Retirement must win before a claim charges reputation or grants a pet.
                exists(
                  tx
                    .select({ id: petSpecies.id })
                    .from(petSpecies)
                    .where(
                      and(
                        eq(petSpecies.id, input.speciesId),
                        eq(petSpecies.isActive, true),
                      ),
                    ),
                ),
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
              speciesId: input.speciesId,
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

  /** Remove an owned companion and discard only its own unused XP bank. */
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
        // An inactive pet owns its bank entirely. A joined DELETE checks both
        // snapshots without updating or serializing an unrelated active XP bank.
        if (user.activePetId !== pet.id) {
          const removed = await retryOnDeadlock(() =>
            ctx.drizzle.execute(sql`
              DELETE ${userPet}
              FROM ${userPet}
              INNER JOIN ${userData} ON ${eq(userData.userId, userPet.userId)}
              WHERE ${and(ownerSnapshotWhere(user), petSnapshotWhere(pet))}
            `),
          );
          return removed.rowsAffected === 1
            ? {
                success: true,
                message:
                  "Your companion returned to the sanctuary. Its progress and unused experience were removed.",
              }
            : changedResponse();
        }
        // DELETE cannot also reset fields on a retained owner row. The active
        // selection and its XP reset must commit with this pet's deletion.
        const released = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const claim = await claimUserSnapshot({
              client: tx,
              userId: user.userId,
              updatedAt: user.updatedAt,
              where: ownerMutationWhere(user),
              set: { petExperience: 0, activePetId: null },
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

  /** Save presentation and battle settings without charging reputation. */
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

  /** Save validated companion AI rules against its current revision. */
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

  /** Spend the active or parked bank together with its companion stat gains. */
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
      const now = new Date();
      const bank = isActive ? userData.petExperience : userPet.storedExperience;
      // The bank debit and revision-guarded gains share one match, so a concurrent
      // swap or allocation cannot spend XP without delivering its stat increases.
      const assigned = await retryOnDeadlock(() =>
        ctx.drizzle.execute(sql`
          UPDATE ${userData}
          INNER JOIN ${userPet} ON ${eq(userPet.userId, userData.userId)}
          SET ${userData.updatedAt} = ${getNextUserSnapshotAt(user.updatedAt, now)},
              ${bank} = ${bank} - ${spent},
              ${sql.join(
                CombatStatNames.map((stat) => sql`${userPet[stat]} = ${stats[stat]}`),
                sql`, `,
              )},
              ${userPet.experience} = ${userPet.experience} + ${spent},
              ${userPet.revision} = ${userPet.revision} + 1,
              ${userPet.updatedAt} = ${now}
          WHERE ${and(ownerSnapshotWhere(user), petSnapshotWhere(pet), gte(bank, spent))}
        `),
      );
      return assigned.rowsAffected > 0
        ? {
            success: true,
            message: `${spent.toLocaleString("en-US")} companion experience assigned.`,
          }
        : changedResponse();
    }),

  /** Evolve an eligible companion for free and require art for its new rank. */
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

  /** Claim a bounded generation lease and accept only its matching provider result. */
  generateAppearance: protectedProcedure
    .input(petSelectionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user, pet } = await fetchPetOwner(ctx.drizzle, ctx.userId, input.petId);
      if (!user || !pet) return errorResponse("Pet not found");
      if (user.isBanned) return errorResponse("You are banned");
      if (!pet.species)
        return errorResponse(
          "This companion's species could not be loaded. Please contact support.",
        );
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

/** Load independent owner and collection snapshots in parallel. */
const fetchPetOwner = async (client: DrizzleClient, userId: string, petId?: string) => {
  const [user, pets] = await Promise.all([
    client.query.userData.findFirst({ where: eq(userData.userId, userId) }),
    client.query.userPet.findMany({
      where: eq(userPet.userId, userId),
      orderBy: userPet.createdAt,
      with: { species: true },
    }),
  ]);
  const pet =
    pets.find((entry) => entry.id === (petId ?? user?.activePetId)) ??
    (!petId ? pets[0] : undefined);
  return { user, pet, pets };
};

/** Load learned jutsus and activated skills for companion loadout validation. */
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

/** Generation tokens are server-only lease credentials. */
const omitGenerationToken = <T extends UserPet>({
  generationToken: _generationToken,
  ...pet
}: T) => pet;

/** Sanctuary adoption requires an eligible, awake player at its current location. */
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

/** Reject expected ownership and combat-state restrictions before any write. */
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

/** Abandoned generation leases expire without releasing ownership. */
const hasActiveGeneration = (pet: UserPet, now = new Date()) =>
  pet.generationStatus === "GENERATING" &&
  (!pet.generationStartedAt ||
    now.getTime() - pet.generationStartedAt.getTime() < PET_GENERATION_LEASE_MS);
/** Keep the validated rank, active identity and ability to mutate current at commit. */
const ownerMutationWhere = (user: UserData) => [
  eq(userData.status, "AWAKE"),
  eq(userData.isBanned, false),
  isNull(userData.battleId),
  user.activePetId
    ? eq(userData.activePetId, user.activePetId)
    : isNull(userData.activePetId),
  eq(userData.rank, user.rank),
];
/** Pin account identity and its monotonic revision alongside the domain guards. */
const ownerSnapshotWhere = (user: UserData) =>
  and(
    eq(userData.userId, user.userId),
    eq(userData.updatedAt, user.updatedAt),
    ...ownerMutationWhere(user),
  );
/** Every pet write must still own the selected identity at the fetched revision. */
const petSnapshotWhere = (pet: UserPet) =>
  and(
    eq(userPet.id, pet.id),
    eq(userPet.userId, pet.userId),
    eq(userPet.revision, pet.revision),
  );
/** Snapshot conflicts remain recoverable mutation results, not server exceptions. */
const changedResponse = () =>
  errorResponse("Your character or companion changed. Refresh and try again.");

/** Active release losing its pet snapshot must roll back the owner's XP reset. */
const petMutationConflict = () =>
  Object.assign(new Error("Companion snapshot changed"), {
    name: "PetMutationConflict",
  });
/** Recognize only the internal signal that requires the active-release rollback. */
const isPetMutationConflict = (error: unknown) =>
  error instanceof Error && error.name === "PetMutationConflict";

/** Publish a pet patch with its account claim and optional reputation charge. */
const updateOwnedPet = async (
  client: DrizzleClient,
  user: UserData,
  pet: UserPet,
  patch: Partial<UserPet>,
  cost = 0,
) => {
  const now = new Date();
  const assignments = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const column = userPet[key as keyof UserPet];
      // Use the column encoder just as Drizzle's set() does, including JSON,
      // nullable generation fields, booleans and millisecond timestamps.
      return sql`${column} = ${sql.param(value, column)}`;
    });
  // Drizzle cannot build a multi-table UPDATE. Both snapshot guards gate the
  // patch and any debit together; free edits have no balance precondition.
  const result = await retryOnDeadlock(() =>
    client.execute(sql`
      UPDATE ${userData}
      INNER JOIN ${userPet} ON ${eq(userPet.userId, userData.userId)}
      SET ${userData.updatedAt} = ${getNextUserSnapshotAt(user.updatedAt, now)},
          ${cost ? sql`${userData.reputationPoints} = ${userData.reputationPoints} - ${cost},` : sql``}
          ${sql.join(assignments, sql`, `)}${assignments.length ? sql`,` : sql``}
          ${userPet.revision} = ${userPet.revision} + 1,
          ${userPet.updatedAt} = ${now}
      WHERE ${and(ownerSnapshotWhere(user), petSnapshotWhere(pet), cost ? gte(userData.reputationPoints, cost) : undefined)}
    `),
  );
  return result.rowsAffected > 0;
};
