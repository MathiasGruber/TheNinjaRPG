import { z } from "zod";
import path from "path";
import TextToSVG from "text-to-svg";
import { randomString } from "@/libs/random";
import { sql, and, desc, eq } from "drizzle-orm";
import { notification, userData, gameSetting, captcha } from "@/drizzle/schema";
import { canSubmitNotification, canModifyEventGains } from "@/utils/permissions";
import { fetchUser } from "@/routers/profile";
import { baseServerResponse, errorResponse } from "../trpc";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { ratelimitMiddleware, hasUserMiddleware } from "../trpc";
import { updateGameSetting } from "@/libs/gamesettings";
import { changeSettingSchema } from "@/validators/misc";
import { secondsFromNow } from "@/utils/time";
import { callDiscordTicket } from "@/libs/discord";
import { TicketTypes } from "@/validators/misc";
import { createTicketSchema } from "@/validators/misc";
import type { DrizzleClient } from "@/server/db";

export const miscRouter = createTRPCRouter({
  getAllGameAssetNames: publicProcedure.query(async ({ ctx }) => {
    return await fetchGameAssets(ctx.drizzle);
  }),
  getCaptcha: protectedProcedure
    .use(ratelimitMiddleware)
    .use(hasUserMiddleware)
    .query(async ({ ctx }) => {
      return await generateCaptcha(ctx.drizzle, ctx.userId);
    }),
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
  setEventGameSetting: protectedProcedure
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
        ctx.drizzle,
        input.setting,
        parseInt(input.multiplier),
        secondsFromNow(input.days * 24 * 3600),
      );
      return { success: true, message: `Setting set to: ${input.multiplier}X` };
    }),
  sendTicket: protectedProcedure
    .input(createTicketSchema.extend({ type: z.enum(TicketTypes) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guards
      if (!user) return errorResponse("User not found");
      // Update
      await callDiscordTicket(input.title, input.content, input.type, user);
      // Return message
      return { success: true, message: `Ticket sent` };
    }),
});

/**
 * Generate a captcha & its hash
 * @returns
 */
export const generateCaptcha = async (client: DrizzleClient, userId: string) => {
  // Fetch
  const current = await client.query.captcha.findFirst({
    where: and(eq(captcha.userId, userId), eq(captcha.used, false)),
  });
  // Value to guess
  const value = current?.value || randomString(6);
  // Create the SVG
  const fontPath = path.resolve("./fonts/OpenSans.ttf");
  const textToSVG = TextToSVG.loadSync(fontPath);
  const svg = textToSVG.getSVG(value, {
    x: 0,
    y: 0,
    fontSize: 40,
    anchor: "top",
    attributes: { fill: "red", stroke: "black" },
  });
  // Insert into database
  if (!current) {
    // Create a new captcha
    await client.insert(captcha).values({ userId, value });
  }
  // Return svg & hash
  return { svg };
};

/**
 * Validate a given captcha value
 * @param hash
 * @param value
 * @returns
 */
export const validateCaptcha = async (
  client: DrizzleClient,
  userId: string,
  guess: string,
) => {
  // Fetch
  const current = await client.query.captcha.findFirst({
    where: and(eq(captcha.userId, userId), eq(captcha.used, false)),
  });
  // Check
  if (current) {
    const success = current.value === guess;
    await client
      .update(captcha)
      .set({ used: true, success: success })
      .where(eq(captcha.id, current.id));
    return success;
  }
  return false;
};

/**
 * Fetches game assets from the database.
 *
 * @param client - The DrizzleClient instance used to query the database.
 * @returns A promise that resolves to an array of game assets, each containing the id, name, and image.
 */
export const fetchGameAssets = async (client: DrizzleClient) => {
  return await client.query.gameAsset.findMany();
};
