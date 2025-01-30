import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "@/api/trpc";
import { eq, and } from "drizzle-orm";
import { dialogFolder, dialogScene, dialogConversation } from "@/drizzle/schema";
import { DialogResponse } from "@/validators/objectives";
import { canChangeContent } from "@/utils/permissions";

export const dialogsRouter = createTRPCRouter({
  createFolder: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(191),
        description: z.string().optional(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Check permissions
      if (!canChangeContent(ctx.userRole)) {
        return errorResponse("You don't have permission to create dialog folders");
      }

      // Create folder
      await ctx.drizzle.insert(dialogFolder).values({
        id: nanoid(),
        name: input.name,
        description: input.description,
      });

      return { success: true, message: `Dialog folder created: ${input.name}` };
    }),

  createScene: protectedProcedure
    .input(
      z.object({
        folderId: z.string().min(1),
        name: z.string().min(1).max(191),
        description: z.string().optional(),
        backgroundImage: z.string().min(1),
        character1Image: z.string().optional(),
        character2Image: z.string().optional(),
        character3Image: z.string().optional(),
        character1Position: z.enum(["left", "center", "right"]).optional(),
        character2Position: z.enum(["left", "center", "right"]).optional(),
        character3Position: z.enum(["left", "center", "right"]).optional(),
        music: z.string().optional(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Check permissions
      if (!canChangeContent(ctx.userRole)) {
        return errorResponse("You don't have permission to create dialog scenes");
      }

      // Check if folder exists
      const folder = await ctx.drizzle.query.dialogFolder.findFirst({
        where: eq(dialogFolder.id, input.folderId),
      });
      if (!folder) {
        return errorResponse("Dialog folder not found");
      }

      // Create scene
      await ctx.drizzle.insert(dialogScene).values({
        id: nanoid(),
        ...input,
      });

      return { success: true, message: `Dialog scene created: ${input.name}` };
    }),

  addConversation: protectedProcedure
    .input(
      z.object({
        sceneId: z.string().min(1),
        speakerName: z.string().min(1).max(191),
        text: z.string().min(1),
        order: z.number().min(0),
        responses: z.array(DialogResponse),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Check permissions
      if (!canChangeContent(ctx.userRole)) {
        return errorResponse("You don't have permission to add dialog conversations");
      }

      // Check if scene exists
      const scene = await ctx.drizzle.query.dialogScene.findFirst({
        where: eq(dialogScene.id, input.sceneId),
      });
      if (!scene) {
        return errorResponse("Dialog scene not found");
      }

      // Create conversation
      await ctx.drizzle.insert(dialogConversation).values({
        id: nanoid(),
        ...input,
      });

      return { success: true, message: `Dialog conversation added` };
    }),

  getFolders: protectedProcedure.query(async ({ ctx }) => {
    return ctx.drizzle.query.dialogFolder.findMany();
  }),

  getScenes: protectedProcedure
    .input(z.object({ folderId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.drizzle.query.dialogScene.findMany({
        where: eq(dialogScene.folderId, input.folderId),
      });
    }),

  getConversations: protectedProcedure
    .input(z.object({ sceneId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.drizzle.query.dialogConversation.findMany({
        where: eq(dialogConversation.sceneId, input.sceneId),
        orderBy: (conversation) => [conversation.order],
      });
    }),
});
