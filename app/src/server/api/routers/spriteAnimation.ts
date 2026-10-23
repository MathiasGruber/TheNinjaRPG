import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NonActionItemTypes } from "@/drizzle/constants";
import {
  actionLog,
  aiSpriteAnimation,
  spriteAnimation,
  userData,
} from "@/drizzle/schema";
import { getDefaultBasicActions } from "@/libs/combat/actions";
import { editedReason, outdateProposalsFor } from "@/libs/contentReview/outdate";
import { spriteActionKey } from "@/libs/spriteAnimations";
import { fetchUser } from "@/routers/profile";
import { createTRPCRouter, errorResponse, protectedProcedure } from "@/server/api/trpc";
import { canChangeContent } from "@/utils/permissions";
import {
  aiSpriteAnimationInput,
  assignSpriteAnimationSchema,
  spriteAnimationSchema,
} from "@/validators/spriteAnimation";

export const spriteAnimationRouter = createTRPCRouter({
  getAiConfig: protectedProcedure
    .input(aiSpriteAnimationInput)
    .query(async ({ ctx, input }) => {
      const [editor, ai, animations] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchAnimationAi(ctx.drizzle, input.userId),
        ctx.drizzle.query.spriteAnimation.findMany({
          orderBy: asc(spriteAnimation.name),
        }),
      ]);
      if (editor.isBanned || !canChangeContent(editor.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Content editor access required",
        });
      }
      if (!ai) throw new TRPCError({ code: "NOT_FOUND", message: "AI not found" });
      return {
        actions: animationActions(ai),
        assignments: ai.spriteAnimationBindings,
        animations,
      };
    }),
  create: protectedProcedure
    .input(spriteAnimationSchema)
    .mutation(async ({ ctx, input }) => {
      const editor = await fetchUser(ctx.drizzle, ctx.userId);
      if (editor.isBanned || !canChangeContent(editor.role))
        return errorResponse("Content editor access required");
      const id = nanoid();
      await Promise.all([
        ctx.drizzle
          .insert(spriteAnimation)
          .values({ ...input, id, createdByUserId: ctx.userId }),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "spriteAnimation",
          relatedId: id,
          relatedMsg: input.name,
          changes: [`Created sprite animation: ${input.name}`],
        }),
      ]);
      return { success: true, message: "Sprite animation created", id };
    }),
  assign: protectedProcedure
    .input(assignSpriteAnimationSchema)
    .mutation(async ({ ctx, input }) => {
      const [editor, ai, animation] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchAnimationAi(ctx.drizzle, input.userId),
        input.animationId
          ? ctx.drizzle.query.spriteAnimation.findFirst({
              where: eq(spriteAnimation.id, input.animationId),
            })
          : undefined,
      ]);
      if (editor.isBanned || !canChangeContent(editor.role))
        return errorResponse("Content editor access required");
      if (!ai) return errorResponse("AI not found");
      if (!animationActions(ai).some((action) => action.key === input.actionKey))
        return errorResponse("This AI does not have that action");
      if (input.animationId && !animation)
        return errorResponse("Sprite animation not found");
      // Assignment and entity version change together, so content review sees one coherent edit.
      await ctx.drizzle.transaction(async (tx) => {
        if (input.animationId) {
          await tx
            .insert(aiSpriteAnimation)
            .values({
              userId: ai.userId,
              actionKey: input.actionKey,
              animationId: input.animationId,
            })
            .onDuplicateKeyUpdate({ set: { animationId: input.animationId } });
        } else {
          await tx
            .delete(aiSpriteAnimation)
            .where(
              and(
                eq(aiSpriteAnimation.userId, ai.userId),
                eq(aiSpriteAnimation.actionKey, input.actionKey),
              ),
            );
        }
        await tx
          .update(userData)
          .set({ updatedAt: new Date() })
          .where(eq(userData.userId, ai.userId));
        await tx.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "ai",
          relatedId: ai.userId,
          relatedMsg: `Animation: ${ai.username}`,
          changes: [
            `${input.actionKey}: ${ai.spriteAnimationBindings.find((binding) => binding.actionKey === input.actionKey)?.animationId ?? "default"} → ${input.animationId ?? "default"}`,
          ],
        });
      });
      await outdateProposalsFor(
        ctx.drizzle,
        "AI",
        [ai.userId],
        editedReason("AI", ai.username, editor.username),
      );
      return {
        success: true,
        message: "Animation assignment saved; new battles use the updated selection",
      };
    }),
});

const fetchAnimationAi = (client: import("@/server/db").DrizzleClient, id: string) =>
  client.query.userData.findFirst({
    where: and(eq(userData.userId, id), eq(userData.isAi, true)),
    with: {
      spriteAnimationBindings: true,
      jutsus: { with: { jutsu: true } },
      items: { with: { item: true } },
    },
  });

const animationActions = (
  ai: NonNullable<Awaited<ReturnType<typeof fetchAnimationAi>>>,
) => [
  { key: "idle", name: "Idle", group: "Default" },
  ...Object.values(getDefaultBasicActions(ai)).map((action) => ({
    key: spriteActionKey(action),
    name: action.name,
    group: "Basic",
  })),
  { key: "basic:wait", name: "Wait / end turn", group: "Basic" },
  ...ai.jutsus
    .filter((entry) => entry.jutsu)
    .map((entry) => ({
      key: `jutsu:${entry.jutsuId}`,
      name: entry.jutsu.name,
      group: "Jutsu",
    })),
  ...ai.items
    .filter((entry) => entry.item && !NonActionItemTypes.includes(entry.item.itemType))
    .map((entry) => ({
      key: `item:${entry.itemId}`,
      name: entry.item.name,
      group: "Item",
    })),
];
