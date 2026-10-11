import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { parentalControl, userData } from "@/drizzle/schema";
import { getServerPusher } from "@/libs/pusher";
import {
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
  serverError,
} from "@/server/api/trpc";
import { hashParentalPin, verifyParentalPin } from "@/server/utils/parentalControls";
import { parentalSettingsSchema } from "@/validators/parentalControls";

export const parentalControlsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.drizzle.query.parentalControl.findFirst({
      where: eq(parentalControl.userId, ctx.userId),
      columns: {
        enabled: true,
        tavernDisabled: true,
        privateMessages: true,
        approvedUserIds: true,
        version: true,
        pinHash: true,
      },
    });
    const approvedPlayers = settings?.approvedUserIds.length
      ? await ctx.drizzle.query.userData.findMany({
          where: inArray(userData.userId, settings.approvedUserIds),
          columns: {
            userId: true,
            username: true,
            avatar: true,
            federalStatus: true,
            rank: true,
            level: true,
          },
        })
      : [];
    return {
      enabled: settings?.enabled ?? false,
      tavernDisabled: settings?.tavernDisabled ?? false,
      privateMessages: settings?.privateMessages ?? ("EVERYONE" as const),
      approvedUserIds: settings?.approvedUserIds ?? [],
      hasPin: !!settings?.pinHash,
      version: settings?.version ?? 0,
      approvedPlayers,
    };
  }),
  save: protectedProcedure
    .input(parentalSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const [settings, players] = await Promise.all([
        ctx.drizzle.query.parentalControl.findFirst({
          where: eq(parentalControl.userId, ctx.userId),
        }),
        input.approvedUserIds.length
          ? ctx.drizzle.query.userData.findMany({
              where: inArray(userData.userId, input.approvedUserIds),
              columns: { userId: true },
            })
          : [],
      ]);
      if (
        players.length !== new Set(input.approvedUserIds).size ||
        input.approvedUserIds.includes(ctx.userId)
      ) {
        return errorResponse("Choose existing players other than yourself.");
      }
      if ((settings?.version ?? 0) !== input.version) {
        return errorResponse(
          "Settings changed in another tab. Reload them before saving.",
        );
      }
      if (settings?.pinHash) {
        // Claim an attempt before hashing, so concurrent requests cannot bypass the five-attempt window.
        const cutoff = new Date(Date.now() - 15 * 60 * 1000);
        const claim = await ctx.drizzle
          .update(parentalControl)
          .set({
            failedAttempts: sql`CASE WHEN ${parentalControl.attemptWindowStart} <= ${cutoff} THEN 1 ELSE ${parentalControl.failedAttempts} + 1 END`,
            attemptWindowStart: sql`CASE WHEN ${parentalControl.attemptWindowStart} <= ${cutoff} THEN ${new Date()} ELSE ${parentalControl.attemptWindowStart} END`,
          })
          .where(
            and(
              eq(parentalControl.userId, ctx.userId),
              eq(parentalControl.version, input.version),
              or(
                lt(parentalControl.failedAttempts, 5),
                sql`${parentalControl.attemptWindowStart} <= ${cutoff}`,
              ),
            ),
          );
        if (!claim.rowsAffected)
          return errorResponse(
            "Too many PIN attempts or settings changed. Try again in 15 minutes or reload settings.",
          );
        if (!(await verifyParentalPin(input.pin, settings.pinHash)))
          return errorResponse("Incorrect parent PIN. Settings were not changed.");
      }
      const values = {
        enabled: input.enabled,
        tavernDisabled: input.enabled && input.tavernDisabled,
        privateMessages: input.enabled ? input.privateMessages : ("EVERYONE" as const),
        approvedUserIds: input.enabled ? [...new Set(input.approvedUserIds)] : [],
        pinHash: input.enabled
          ? await hashParentalPin(input.newPin ?? input.pin)
          : null,
        failedAttempts: 0,
        attemptWindowStart: new Date(),
        version: input.version + 1,
      };
      let result: { rowsAffected: number };
      try {
        result = settings
          ? await ctx.drizzle
              .update(parentalControl)
              .set(values)
              .where(
                and(
                  eq(parentalControl.userId, ctx.userId),
                  eq(parentalControl.version, input.version),
                ),
              )
          : await ctx.drizzle
              .insert(parentalControl)
              .ignore()
              .values({ userId: ctx.userId, ...values });
      } catch {
        // Drizzle errors include SQL parameters, including the PIN hash. Do not expose
        // this derived credential to response serialization or error telemetry.
        throw serverError(
          "INTERNAL_SERVER_ERROR",
          "Could not save parental controls. Please try again.",
        );
      }
      if (!result.rowsAffected)
        return errorResponse(
          "Settings changed in another tab. Reload them before saving.",
        );
      void Promise.resolve()
        .then(() =>
          getServerPusher().trigger(ctx.userId, "event", {
            type: "parentalControlsChanged",
          }),
        )
        .catch(() => undefined);
      return {
        success: true,
        message: input.enabled
          ? "Parental controls saved"
          : "Parental controls disabled",
      };
    }),
});
