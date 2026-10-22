import * as Sentry from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  DMG_SETTING_DEFAULTS,
  DMG_SETTING_NAMES,
  PET_ART_PROVIDER_SETTING,
  PetArtProviders,
} from "@/drizzle/constants";
import { gameSetting } from "@/drizzle/schema";
import type { DmgConfig } from "@/libs/combat/constants";
import type { DrizzleClient } from "@/server/db";
import {
  addDays,
  getDaysHoursMinutesSeconds,
  getTimeLeftStr,
  getWeekNumber,
  isDifferentDay,
} from "@/utils/time";

/**
 * Retrieves the game setting for the specified timer name.
 * If the setting does not exist, it creates a new one with default values.
 * @param client - The DrizzleClient instance used for querying the database.
 * @param name - The name of the timer.
 * @returns The game setting for the specified timer name.
 */
export const getGameSetting = async (client: DrizzleClient, name: string) => {
  let setting = await client.query.gameSetting.findFirst({
    where: eq(gameSetting.name, name),
  });
  if (!setting) {
    setting = { id: nanoid(), name: name, time: addDays(new Date(), -30), value: 0 };
    await client.insert(gameSetting).values(setting);
  }
  return setting;
};

/**
 * Updates the value of a game setting in the database.
 *
 * @param settingName - The name of the setting to update.
 * @param value - The new value for the setting.
 * @param time - The timestamp for the setting.
 * @returns - A promise that resolves when the update is complete.
 */
export const updateGameSetting = async (
  client: DrizzleClient,
  settingName: string,
  value: number,
  time: Date,
) => {
  const setting = await getGameSetting(client, settingName);
  await client
    .update(gameSetting)
    .set({ value, time })
    .where(eq(gameSetting.name, setting.name));
};

/**
 * Claim a named timer using the timestamp read for eligibility. Only the winner
 * may perform work or change the marker afterwards; a failed older run must not
 * release a claim taken in a later period.
 */
const claimGameTimer = async (
  client: DrizzleClient,
  name: string,
  isEligible: (previous: Date, now: Date) => boolean,
) => {
  const timer = await getGameSetting(client, name);
  const now = new Date();
  const claim = isEligible(timer.time, now)
    ? await client
        .update(gameSetting)
        .set({ value: 0, time: now })
        .where(and(eq(gameSetting.id, timer.id), eq(gameSetting.time, timer.time)))
    : undefined;
  const isClaimed = claim?.rowsAffected === 1;
  let ownsClaim = isClaimed;

  // Completion values, resume markers and rollback all relinquish this claim.
  const update = async (value: number, time: Date) => {
    if (!ownsClaim) return false;
    const result = await client
      .update(gameSetting)
      .set({ value, time })
      .where(and(eq(gameSetting.id, timer.id), eq(gameSetting.time, now)));
    ownsClaim = false;
    return result.rowsAffected === 1;
  };

  return {
    isClaimed,
    prevTime: timer.time,
    prevValue: timer.value,
    update,
    release: () => update(0, timer.time),
  };
};

/** Atomically claim a rolling duration, retaining the persisted timer name. */
export const lockWithGameTimer = async (
  client: DrizzleClient,
  timerName: string,
  durationMs: number,
) => {
  const deltaTime = durationMs * 0.9999;
  const claim = await claimGameTimer(
    client,
    timerName,
    (previous, now) => previous.getTime() <= now.getTime() - deltaTime,
  );
  if (claim.isClaimed) return false;
  return gameTimerWaitResponse(claim.prevTime, deltaTime);
};

/** Atomically claim one rolling hour. */
export const lockWithHourlyTimer = async (client: DrizzleClient, name: string) => {
  const claim = await claimGameTimer(
    client,
    name,
    (previous, now) => now.getTime() - previous.getTime() >= 60 * 60 * 1000,
  );
  return {
    ...claim,
    isNewHour: claim.isClaimed,
    response: Response.json(
      claim.isClaimed
        ? null
        : "Wait until an hour has passed before running this again",
    ),
  };
};

/** Atomically claim once per UTC calendar minute. */
export const lockWithMinuteTimer = async (client: DrizzleClient, name: string) => {
  const claim = await claimGameTimer(
    client,
    name,
    (previous, now) =>
      isDifferentDay(now, previous) ||
      now.getUTCHours() !== previous.getUTCHours() ||
      now.getUTCMinutes() !== previous.getUTCMinutes(),
  );
  return {
    ...claim,
    isNewMinute: claim.isClaimed,
    response: Response.json(
      claim.isClaimed ? null : "Wait until the next minute to run this again",
    ),
  };
};

/** Atomically claim once per UTC calendar day. */
export const lockWithDailyTimer = async (client: DrizzleClient, name: string) => {
  const claim = await claimGameTimer(client, name, (previous, now) =>
    isDifferentDay(now, previous),
  );
  return {
    ...claim,
    isNewDay: claim.isClaimed,
    response: Response.json(
      claim.isClaimed ? null : "Wait until the next day to run this again",
    ),
  };
};

/** Atomically claim when the existing calendar week number changes. */
export const lockWithWeeklyTimer = async (client: DrizzleClient, name: string) => {
  const claim = await claimGameTimer(
    client,
    name,
    (previous, now) => getWeekNumber(now) !== getWeekNumber(previous),
  );
  return {
    ...claim,
    isNewWeek: claim.isClaimed,
    response: Response.json(
      claim.isClaimed ? null : "Wait until the next week to run this again",
    ),
  };
};

/** Atomically claim once per UTC calendar month. */
export const lockWithMonthlyTimer = async (client: DrizzleClient, name: string) => {
  const claim = await claimGameTimer(
    client,
    name,
    (previous, now) =>
      now.getUTCFullYear() !== previous.getUTCFullYear() ||
      now.getUTCMonth() !== previous.getUTCMonth(),
  );
  return {
    ...claim,
    isNewMonth: claim.isClaimed,
    response: Response.json(
      claim.isClaimed ? null : "Wait until the next month to run this again",
    ),
  };
};

/**
 * Checks the game timer and returns a response indicating how much time is left before the game can be run again.
 * @param client - The database client used to read or initialize the timer.
 * @param timerName - Stable game-setting name, independent of the duration.
 * @param durationMs - The timer duration in milliseconds.
 * @returns A JSON response indicating the time left before the game can be run again.
 */
export const checkGameTimer = async (
  client: DrizzleClient,
  timerName: string,
  durationMs: number,
) => {
  const timer = await getGameSetting(client, timerName);
  const deltaTime = durationMs * 0.9999;
  if (timer.time > new Date(Date.now() - deltaTime)) {
    return gameTimerWaitResponse(timer.time, deltaTime);
  }
  return false;
};

const gameTimerWaitResponse = (previous: Date, durationMs: number) => {
  const remaining = previous.getTime() + durationMs - Date.now();
  if (remaining <= 0) return Response.json("Timer already claimed; try again later");
  const [days, hours, minutes, seconds] = getDaysHoursMinutesSeconds(remaining);
  return Response.json(
    `Wait ${getTimeLeftStr(days, hours, minutes, seconds)} before running again`,
  );
};

/**
 * Read the companion art provider without creating a row: the setting stores an index
 * into PetArtProviders, and an absent or unknown value selects GPT.
 */
export const fetchPetArtProvider = async (client: DrizzleClient) => {
  const setting = await client.query.gameSetting.findFirst({
    where: eq(gameSetting.name, PET_ART_PROVIDER_SETTING),
  });
  return PetArtProviders[setting?.value ?? 0] ?? "GPT";
};

/**
 * Fetches the DMG config from the gameSetting table.
 * If any settings are missing, inserts them with their default values.
 * Returns a DmgConfig object ready for use in combat calculations.
 */
export const fetchDmgConfig = async (client: DrizzleClient): Promise<DmgConfig> => {
  const settings = await client
    .select()
    .from(gameSetting)
    .where(inArray(gameSetting.name, DMG_SETTING_NAMES));

  // Find which settings are missing and insert them with defaults
  const existingNames = new Set(settings.map((s) => s.name));
  const missing = DMG_SETTING_NAMES.filter((n) => !existingNames.has(n));
  if (missing.length > 0) {
    const newSettings = missing.map((name) => ({
      id: nanoid(),
      name,
      time: addDays(new Date(), -30),
      value: DMG_SETTING_DEFAULTS[name] ?? 0,
    }));
    await client.insert(gameSetting).values(newSettings);
    settings.push(...newSettings);
  }

  // Convert to DmgConfig, falling back to defaults for safety
  const get = (name: string) =>
    settings.find((s) => s.name === name)?.value ?? DMG_SETTING_DEFAULTS[name] ?? 0;

  return {
    stats_scaling: get("DMG_STATS_SCALING"),
    base_hits: get("DMG_BASE_HITS"),
    curve: get("DMG_CURVE"),
    amplitude: get("DMG_AMPLITUDE"),
    ep_normalization: get("DMG_EP_NORMALIZATION"),
    gen_weight: get("DMG_GEN_WEIGHT"),
    advantage_min: get("DMG_ADVANTAGE_MIN"),
    advantage_max: get("DMG_ADVANTAGE_MAX"),
  };
};

/**
 * Handles errors that occur during endpoint processing.
 * Logs the error to the console, captures it to Sentry, and returns an appropriate HTTP response.
 *
 * @param cause - The error that occurred. This can be of any type.
 * @param context - Optional context for the error (e.g., endpoint name).
 * @returns A JSON response with the error details and the appropriate HTTP status code.
 *          If the error is an instance of TRPCError, the response will contain the error details
 *          and the corresponding HTTP status code. Otherwise, it returns a generic "Internal server error"
 *          message with a 500 status code.
 */
export const handleEndpointError = async (
  cause: unknown,
  context?: { endpoint?: string },
) => {
  console.error(cause);

  // Capture to Sentry
  Sentry.captureException(cause, {
    extra: { endpoint: context?.endpoint },
    tags: { type: "api_route_error" },
  });

  // Flush for serverless - critical for Vercel Lambda environments
  try {
    await Sentry.flush(5000);
  } catch (e) {
    console.error("[handleEndpointError] Sentry flush failed:", e);
  }

  if (cause instanceof TRPCError) {
    // An error from tRPC occured
    const httpCode = getHTTPStatusCodeFromError(cause);
    return Response.json(cause, { status: httpCode });
  }
  // Another error occured
  return Response.json("Internal server error", { status: 500 });
};
