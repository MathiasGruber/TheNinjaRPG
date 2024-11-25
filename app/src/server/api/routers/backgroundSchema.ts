// src/server/api/routers/backgroundSchema.ts

import { createTRPCRouter, errorResponse, protectedProcedure } from "../trpc";
import { z } from "zod";
import { BackgroundSchemaValidator } from "@/validators/backgroundSchema";
import { backgroundSchema } from "@/drizzle/schema";
import { eq, desc, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  IMG_BG_COLISEUM,
  IMG_BG_OCEAN,
  IMG_BG_FOREST,
  IMG_BG_DESSERT,
  IMG_BG_ICE,
} from "@/drizzle/constants";
import { canChangeContent, canChangeCombatBgScheme } from "@/utils/permissions";
import { fetchUser } from "@/routers/profile";

export const backgroundSchemaRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const schemas = await ctx.drizzle
      .select()
      .from(backgroundSchema)
      .orderBy(desc(backgroundSchema.createdAt));
    return schemas;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const schema = await ctx.drizzle
        .select()
        .from(backgroundSchema)
        .where(eq(backgroundSchema.id, input.id))
        .limit(1);

      return schema[0] || null;
    }),

  create: protectedProcedure.mutation(async ({ ctx }) => {
    // Check permissions
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      // Step 1: Fetch existing schemas with names starting with 'New Background Schema'
      const existingSchemas = await ctx.drizzle
        .select()
        .from(backgroundSchema)
        .where(like(backgroundSchema.name, "New Background Schema%"))
        .orderBy(desc(backgroundSchema.createdAt));

      let baseName = "New Background Schema";
      let newName = baseName;
      let suffix = 1;
      const id = nanoid();

      // Step 2: Determine a unique name by appending a numerical suffix if necessary
      while (existingSchemas.some((schema) => schema.name === newName)) {
        newName = `${baseName} ${suffix}`;
        suffix += 1;
      }

      // Step 3: Insert the new schema with the unique name
      const result = await ctx.drizzle.insert(backgroundSchema).values({
        id: id,
        name: newName,
        description: "New Background Schema Description",
        isActive: false,
        schema: {
          ocean: IMG_BG_OCEAN,
          ice: IMG_BG_ICE,
          dessert: IMG_BG_DESSERT,
          ground: IMG_BG_FOREST,
          arena: IMG_BG_COLISEUM,
          default: IMG_BG_FOREST,
        },
      });

      return { message: id, success: true };
    } else {
      return errorResponse(
        "You do not have permission to create a new background schema",
      );
    }
  }),

  update: protectedProcedure
    .input(
      BackgroundSchemaValidator.extend({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check permissions
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (canChangeContent(user.role)) {
        const { id, ...data } = input;
        await ctx.drizzle
          .update(backgroundSchema)
          .set({
            name: data.name,
            description: data.description,
            isActive: data.isActive,
            schema: data.schema,
          })
          .where(eq(backgroundSchema.id, id));

        return { message: "Schema updated successfully", success: true };
      } else {
        return errorResponse(
          "You do not have permission to update a background schema",
        );
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check permissions
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (canChangeCombatBgScheme(user.role)) {
        await ctx.drizzle
          .delete(backgroundSchema)
          .where(eq(backgroundSchema.id, input.id));

        return { message: "Schema deleted successfully", success: true };
      } else {
        return errorResponse(
          "You do not have permission to delete a background schema",
        );
      }
    }),

  activate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check permissions
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (canChangeCombatBgScheme(user.role)) {
        const { id } = input;

        try {
          // Deactivate all other schemas
          await ctx.drizzle.update(backgroundSchema).set({
            isActive: false,
          });

          // Activate the selected schema
          const updatedSchema = await ctx.drizzle
            .update(backgroundSchema)
            .set({ isActive: true })
            .where(eq(backgroundSchema.id, id));

          return {
            message: "Schema activated successfully",
            success: true,
            data: updatedSchema,
          };
        } catch (error) {
          throw new Error(`Error activating background schema: ${error.message}`);
        }
      } else {
        return errorResponse(
          "You do not have permission to activate a background schema",
        );
      }
    }),
});
