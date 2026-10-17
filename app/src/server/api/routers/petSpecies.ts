import { asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { actionLog, jutsu, petSpecies } from "@/drizzle/schema";
import { isPetJutsuAllowed } from "@/libs/pets/abilities";
import { callDiscordContent } from "@/libs/socials";
import { fetchUser } from "@/routers/profile";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
  publicProcedure,
  serverError,
} from "@/server/api/trpc";
import { isMysqlDuplicateKeyError } from "@/server/utils/mysqlErrors";
import { calculateContentDiff } from "@/utils/diff";
import { canChangeContent } from "@/utils/permissions";
import { idSchema } from "@/validators/misc";
import { PetSpeciesValidator, updatePetSpeciesSchema } from "@/validators/petSpecies";

/** Manage authored species independently of each companion's generated artwork and progress. */
export const petSpeciesRouter = createTRPCRouter({
  /** Include retired species so the manual and owned companions retain their identities. */
  getAll: publicProcedure.query(({ ctx }) =>
    ctx.drizzle.query.petSpecies.findMany({ orderBy: asc(petSpecies.name) }),
  ),

  /** Resolve the same authored identity for both editing and previously adopted pets. */
  get: publicProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const species = await ctx.drizzle.query.petSpecies.findFirst({
      where: eq(petSpecies.id, input.id),
    });
    if (!species) throw serverError("NOT_FOUND", "Companion species not found");
    return species;
  }),

  /** Save a new immutable species ID using the shared Content permission and audit conventions. */
  create: protectedProcedure
    .input(PetSpeciesValidator)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, existing, defaults] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.petSpecies.findFirst({
          where: eq(petSpecies.name, input.name),
        }),
        input.defaultJutsuIds.length
          ? ctx.drizzle.query.jutsu.findMany({
              where: inArray(jutsu.id, input.defaultJutsuIds),
            })
          : [],
      ]);
      if (user.isBanned)
        return errorResponse("You are banned and cannot perform this action");
      if (!canChangeContent(user.role))
        return errorResponse("Not allowed to create companion species");
      if (existing) return errorResponse("Companion species name already exists");
      if (
        defaults.length !== input.defaultJutsuIds.length ||
        defaults.some((entry) => !isPetJutsuAllowed(entry))
      )
        return errorResponse(
          "Choose published, compatible PETS jutsu for the default loadout.",
        );
      const id = nanoid();
      try {
        await ctx.drizzle.insert(petSpecies).values({ id, ...input });
      } catch (error) {
        if (isMysqlDuplicateKeyError(error))
          return errorResponse("Companion species name already exists");
        throw error;
      }
      const changes = calculateContentDiff({}, input);
      await ctx.drizzle.insert(actionLog).values({
        id: nanoid(),
        userId: ctx.userId,
        tableName: "petSpecies",
        changes,
        relatedId: id,
        relatedMsg: `Create: ${input.name}`,
      });
      if (process.env.NODE_ENV !== "development") {
        await callDiscordContent(user.username, input.name, changes);
      }
      return { success: true, message: id };
    }),

  /** Retirement removes future offerings; existing pets, portraits and progression stay intact. */
  update: protectedProcedure
    .input(updatePetSpeciesSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, species, existing, defaults] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.petSpecies.findFirst({ where: eq(petSpecies.id, input.id) }),
        ctx.drizzle.query.petSpecies.findFirst({
          where: eq(petSpecies.name, input.data.name),
        }),
        input.data.defaultJutsuIds.length
          ? ctx.drizzle.query.jutsu.findMany({
              where: inArray(jutsu.id, input.data.defaultJutsuIds),
            })
          : [],
      ]);
      if (user.isBanned)
        return errorResponse("You are banned and cannot perform this action");
      if (!canChangeContent(user.role))
        return errorResponse("Not allowed to edit companion species");
      if (!species) return errorResponse("Companion species not found");
      if (existing && existing.id !== species.id)
        return errorResponse("Companion species name already exists");
      if (
        defaults.length !== input.data.defaultJutsuIds.length ||
        defaults.some((entry) => !isPetJutsuAllowed(entry))
      )
        return errorResponse(
          "Choose published, compatible PETS jutsu for the default loadout.",
        );
      const changes = calculateContentDiff(species, { ...species, ...input.data });
      if (changes.length === 0)
        return { success: true, message: "Companion species is already up to date." };
      try {
        const updated = await ctx.drizzle
          .update(petSpecies)
          .set({ ...input.data, updatedAt: new Date() })
          .where(eq(petSpecies.id, species.id));
        if (updated.rowsAffected !== 1)
          return errorResponse("Companion species not found");
      } catch (error) {
        if (isMysqlDuplicateKeyError(error))
          return errorResponse("Companion species name already exists");
        throw error;
      }
      await ctx.drizzle.insert(actionLog).values({
        id: nanoid(),
        userId: ctx.userId,
        tableName: "petSpecies",
        changes,
        relatedId: species.id,
        relatedMsg: `Update: ${species.name}`,
      });
      if (process.env.NODE_ENV !== "development") {
        await callDiscordContent(user.username, input.data.name, changes);
      }
      return { success: true, message: "Companion species updated." };
    }),
});
