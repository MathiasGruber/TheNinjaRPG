import { and, asc, eq, exists, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { actionLog, title, userData, userTitle } from "@/drizzle/schema";
import { editedReason, outdateProposalsFor } from "@/libs/contentReview/outdate";
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
import { calculateContentDiff } from "@/utils/diff";
import { canChangeContent } from "@/utils/permissions";
import { idSchema } from "@/validators/misc";
import { SelectTitleSchema, UpdateTitleSchema } from "@/validators/title";

/** Public reward options, staff catalog management and ownership-guarded label selection. */
export const titleRouter = createTRPCRouter({
  /** Public reward selectors offer only active, staff-authored titles. */
  getAllNames: publicProcedure.query(({ ctx }) =>
    ctx.drizzle.query.title.findMany({
      where: and(isNull(title.legacyOwnerId), eq(title.archived, false)),
      orderBy: asc(title.name),
    }),
  ),
  /** Staff can inspect archived catalog entries; private legacy labels stay excluded. */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (!canChangeContent(user.role))
      throw serverError("FORBIDDEN", "Not allowed to manage titles");
    return ctx.drizzle.query.title.findMany({
      where: isNull(title.legacyOwnerId),
      orderBy: asc(title.name),
    });
  }),
  /** Authorize the editor read and exclude per-player legacy rows. */
  get: protectedProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const [user, entry] = await Promise.all([
      fetchUser(ctx.drizzle, ctx.userId),
      ctx.drizzle.query.title.findFirst({
        where: and(eq(title.id, input.id), isNull(title.legacyOwnerId)),
      }),
    ]);
    if (!canChangeContent(user.role))
      throw serverError("FORBIDDEN", "Not allowed to manage titles");
    if (!entry) throw serverError("NOT_FOUND", "Title not found");
    return entry;
  }),
  /** Change only the displayed label; null clears it without removing any owned bonus. */
  select: protectedProcedure
    .input(SelectTitleSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Ownership and account eligibility are checked by the write, including archived/legacy ownership.
      const result = await ctx.drizzle
        .update(userData)
        .set({ activeTitleId: input.titleId })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            eq(userData.isBanned, false),
            eq(userData.isAi, false),
            input.titleId
              ? exists(
                  ctx.drizzle
                    .select({ id: userTitle.titleId })
                    .from(userTitle)
                    .where(
                      and(
                        eq(userTitle.userId, ctx.userId),
                        eq(userTitle.titleId, input.titleId),
                      ),
                    ),
                )
              : undefined,
          ),
        );
      if (result.rowsAffected === 0) {
        // MySQL may report no changed rows when selecting the current label.
        const user = await fetchUser(ctx.drizzle, ctx.userId);
        if (user.isBanned || user.isAi || user.activeTitleId !== input.titleId)
          return errorResponse("You can only select a title you own");
      }
      return {
        success: true,
        message: input.titleId ? "Title selected" : "Title cleared",
      };
    }),
  /** Create a catalog entry and return its ID for the shared content editor. */
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (user.isBanned || !canChangeContent(user.role))
      return errorResponse("Not allowed to create titles");
    const id = nanoid();
    await Promise.all([
      ctx.drizzle.insert(title).values({ id, name: `New Title - ${id}` }),
      ctx.drizzle.insert(actionLog).values({
        id: nanoid(),
        userId: ctx.userId,
        tableName: "title",
        relatedId: id,
        relatedMsg: "Create title",
        changes: ["Created title"],
      }),
    ]);
    return { success: true, message: id };
  }),
  /** Stop future grants without deleting ownership or its snapshotted bonuses. */
  archive: protectedProcedure
    .input(idSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, entry] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.title.findFirst({
          where: and(eq(title.id, input.id), isNull(title.legacyOwnerId)),
        }),
      ]);
      if (user.isBanned || !canChangeContent(user.role))
        return errorResponse("Not allowed to archive titles");
      if (!entry) return errorResponse("Title not found");
      await Promise.all([
        ctx.drizzle
          .update(title)
          .set({ archived: true, updatedAt: new Date() })
          .where(eq(title.id, entry.id)),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "title",
          relatedId: entry.id,
          relatedMsg: `Archive: ${entry.name}`,
          changes: ["Archived title"],
        }),
      ]);
      await outdateProposalsFor(
        ctx.drizzle,
        "TITLE",
        [entry.id],
        editedReason("TITLE", entry.name, user.username),
      );
      return { success: true, message: "Title archived" };
    }),
  /** Save future award content and outdate proposals based on the previous catalog version. */
  update: protectedProcedure
    .input(UpdateTitleSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, entry] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.title.findFirst({
          where: and(eq(title.id, input.id), isNull(title.legacyOwnerId)),
        }),
      ]);
      if (user.isBanned || !canChangeContent(user.role))
        return errorResponse("Not allowed to edit titles");
      if (!entry) return errorResponse("Title not found");
      const diff = calculateContentDiff(entry, { ...entry, ...input.data });
      await Promise.all([
        ctx.drizzle
          .update(title)
          .set({ ...input.data, updatedAt: new Date() })
          .where(and(eq(title.id, input.id), isNull(title.legacyOwnerId))),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "title",
          relatedId: entry.id,
          relatedMsg: `Update: ${input.data.name}`,
          changes: diff,
        }),
      ]);
      await outdateProposalsFor(
        ctx.drizzle,
        "TITLE",
        [entry.id],
        editedReason("TITLE", entry.name, user.username),
      );
      if (process.env.NODE_ENV !== "development")
        await callDiscordContent(user.username, entry.name, diff, "");
      return { success: true, message: "Title saved" };
    }),
});
