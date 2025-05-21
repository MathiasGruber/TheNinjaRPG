import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { eq, and, like, inArray } from "drizzle-orm";
import { extractValueFromJson } from "@/utils/regex";
import { actionLog, village, bloodline } from "@/drizzle/schema";
import { actionLogSchema } from "@/validators/logs";
import { fetchUser } from "@/routers/profile";
import { canSeeSecretData } from "@/utils/permissions";

export const logsRouter = createTRPCRouter({
  getContentChanges: publicProcedure
    .input(
      actionLogSchema.extend({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        relatedId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const [entries, user] = await Promise.all([
        ctx.drizzle.query.actionLog.findMany({
          where: and(
            eq(actionLog.tableName, input.logtype),
            ...(input.relatedId ? [eq(actionLog.relatedId, input.relatedId)] : []),
            ...(input.search ? [like(actionLog.changes, `%${input.search}%`)] : []),
          ),
          columns: {
            userId: true,
            createdAt: true,
            changes: true,
            relatedId: true,
            relatedMsg: true,
            relatedImage: true,
          },
          with: {
            user: {
              columns: {
                username: true,
              },
            },
          },
          offset: skip,
          orderBy: (table, { desc }) => desc(table.createdAt),
          limit: input.limit,
        }),
        ctx.userId ? fetchUser(ctx.drizzle, ctx.userId) : null,
      ]);
      // Overwrite all villageIds, bloodlineIds, etc. with their names
      const villageIds: string[] = [];
      const bloodlineIds: string[] = [];
      entries.forEach((entry) => {
        (entry.changes as string[]).forEach((change) => {
          const bloodlineId = extractValueFromJson(change, "bloodlineId");
          const villageId = extractValueFromJson(change, "villageId");
          if (bloodlineId) bloodlineIds.push(bloodlineId);
          if (villageId) villageIds.push(villageId);
        });
      });
      const [bloodlines, villages] = await Promise.all([
        ctx.drizzle.query.bloodline.findMany({
          where: inArray(bloodline.id, bloodlineIds),
          columns: { id: true, name: true },
        }),
        ctx.drizzle.query.village.findMany({
          where: inArray(village.id, villageIds),
          columns: { id: true, name: true },
        }),
      ]);
      // If user is not set, or not allowed to see secret data, hide username
      if (!user || !canSeeSecretData(user.role)) {
        entries.forEach((entry) => {
          entry.userId = "Annonymized";
          if (entry.user) {
            entry.user.username = "Annonymized";
          }
        });
      }

      // Return
      const nextCursor = entries.length < input.limit ? null : currentCursor + 1;
      return {
        data: entries.map((entry) => ({
          ...entry,
          changes: (entry.changes as string[])?.map((change) => {
            bloodlines.forEach((b) => {
              change = change.replace(b.id, `${b.id} - ${b.name}`);
            });
            villages.forEach((v) => {
              change = change.replace(v.id, `${v.id} - ${v.name}`);
            });
            return change;
          }),
        })),
        nextCursor: nextCursor,
      };
    }),
});
