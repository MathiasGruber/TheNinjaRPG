import { z } from "zod";
import { sql, desc, eq } from "drizzle-orm";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { notification, userData, gameSetting } from "@/drizzle/schema";
import { canSubmitNotification, canModifyEventGains } from "@/utils/permissions";
import { fetchUser } from "@/routers/profile";
import { baseServerResponse, errorResponse } from "../trpc";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { updateGameSetting } from "@/libs/gamesettings";
import { changeSettingSchema } from "@/validators/misc";
import { secondsFromNow } from "@/utils/time";
import PushNotifications from "@pusher/push-notifications-server";

export const miscRouter = createTRPCRouter({
  submitNotification: protectedProcedure
    .input(z.object({ content: z.string().min(2).max(10000), senderId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query data
      const [user, sender] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.senderId),
      ]);
      // Guards
      if (!canSubmitNotification(user.role)) return errorResponse("Not allowed");
      if (!user || !sender) return errorResponse("User not found");
      if (user.userId !== sender.userId && !sender.isAi) {
        return errorResponse("You or an AI must be marked as sender");
      }
      // Push notifications
      const instanceId = process.env.NEXT_PUBLIC_PUSHER_BEAM_ID;
      const secretKey = process.env.PUSHER_BEAM_SECRET;
      if (instanceId && secretKey) {
        const nhm = new NodeHtmlMarkdown({}, undefined, undefined);
        const client = new PushNotifications({ instanceId, secretKey });
        client
          .publishToInterests(["global"], {
            web: {
              notification: {
                title: "TheNinja-RPG",
                body: nhm.translate(input.content),
                deep_link: "https://www.theninja-rpg.com",
              },
            },
          })
          .then((publishResponse) => {
            console.log("Just published:", publishResponse.publishId);
          })
          .catch((error) => {
            console.log("Error:", error);
          });
      }
      // Update database
      const [result] = await Promise.all([
        ctx.drizzle.insert(notification).values({
          userId: sender.userId,
          content: input.content,
        }),
        ctx.drizzle
          .update(userData)
          .set({ unreadNotifications: sql`unreadNotifications + 1` }),
      ]);
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could insert notificaiton in db" };
      } else {
        return { success: true, message: "Notification sent" };
      }
    }),
  getPreviousNotifications: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.notification.findMany({
        offset: skip,
        limit: input.limit,
        with: { user: true },
        orderBy: [desc(notification.createdAt)],
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  getSetting: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => {
      const setting = await ctx.drizzle.query.gameSetting.findFirst({
        where: eq(gameSetting.name, input.name),
      });
      return setting || null;
    }),
  setTrainingGain: protectedProcedure
    .input(changeSettingSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guards
      if (!canModifyEventGains(user.role)) return errorResponse("Not allowed");
      if (!user) return errorResponse("User not found");
      // Update
      await updateGameSetting(
        "trainingGainMultiplier",
        parseInt(input.multiplier),
        secondsFromNow(input.days * 24 * 3600),
      );
      return { success: true, message: `Training gain set to: ${input.multiplier}X` };
    }),
});
