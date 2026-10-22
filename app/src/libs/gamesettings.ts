import * as Sentry from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  DMG_SETTING_DEFAULTS,
  DMG_SETTING_NAMES,
  PET_ART_PROVIDER_SETTING,
  PetArtProviders,
} from "@/drizzle/constants";
import { type GameSetting, gameSetting } from "@/drizzle/schema";
import type { DmgConfig } from "@/libs/combat/constants";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
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
  const setting = await client.query.gameSetting.findFirst({
    where: eq(gameSetting.name, name),
  });
  if (setting) return setting;
  await initializeGameSettings(client, [
    { name, time: addDays(new Date(), -30), value: 0 },
  ]);
  // A concurrent initializer may own the row; claims must use its persisted id/time.
  const initialized = await client.query.gameSetting.findFirst({
    where: eq(gameSetting.name, name),
  });
  if (!initialized) throw new Error(`Game setting ${name} could not be initialized`);
  return initialized;
};

/** Insert missing named settings together without overwriting an existing value or timer. */
export const initializeGameSettings = async (
  client: DrizzleClient,
  settings: Pick<GameSetting, "name" | "time" | "value">[],
) => {
  if (!settings.length) return;
  // Concurrent cold starts can deadlock on the primary and unique name indexes.
  // The no-op conflict update makes the whole insert safe to retry.
  await retryOnDeadlock(async () =>
    client
      .insert(gameSetting)
      .values(settings.map((setting) => ({ ...setting, id: nanoid() })))
      .onDuplicateKeyUpdate({ set: { id: sql`${gameSetting.id}` } }),
  );
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
 * Locks the game for an explicit duration using a stable persisted timer name.
 *
 * @param client - The DrizzleClient instance to interact with the game settings.
 * @param timerName - Stable game-setting name, independent of the duration.
 * @param durationMs - The timer duration in milliseconds.
 * @returns A promise that resolves to the response from the checkGameTimer function.
 */
export const lockWithGameTimer = async (
  client: DrizzleClient,
  timerName: string,
  durationMs: number,
) => {
  const response = await checkGameTimer(client, timerName, durationMs);
  if (!response) {
    await updateGameSetting(client, timerName, 0, new Date());
  }
  return response;
};

/**
 * Locks the named game setting for one rolling hour.
 *
 * @param client - Database client used to read and update the timer.
 * @param name - Stable game-setting name identifying the hourly timer.
 * @returns Whether a new hour began, the prior timestamp, and a wait response.
 */
export const lockWithHourlyTimer = async (client: DrizzleClient, name: string) => {
  const timer = await getGameSetting(client, name);
  const prevTime = timer.time;
  const now = new Date();
  const isNewHour = now.getTime() - prevTime.getTime() >= 60 * 60 * 1000;
  let response: string | null = null;
  if (!isNewHour) {
    response = "Wait until an hour has passed before running this again";
  } else {
    await updateGameSetting(client, name, 0, now);
  }
  return { isNewHour, prevTime, response: Response.json(response, { status: 200 }) };
};

/**
 * Locks the game with a minute timer.
 *
 * @param client
 * @param name
 * @returns
 */
export const lockWithMinuteTimer = async (client: DrizzleClient, name: string) => {
  const timer = await getGameSetting(client, name);
  const prevTime = timer.time;

  const now = new Date();
  const isNewMinute =
    now.getUTCFullYear() !== prevTime.getUTCFullYear() ||
    now.getUTCMonth() !== prevTime.getUTCMonth() ||
    now.getUTCDate() !== prevTime.getUTCDate() ||
    now.getUTCHours() !== prevTime.getUTCHours() ||
    now.getUTCMinutes() !== prevTime.getUTCMinutes();

  let response: string | null = null;
  if (!isNewMinute) {
    response = "Wait until the next minute to run this again";
  } else {
    await updateGameSetting(client, name, 0, now);
  }

  return { isNewMinute, prevTime, response: Response.json(response, { status: 200 }) };
};

/**
 * Atomically claims a named timer once per UTC calendar day.
 *
 * @param client
 * @param name
 * @returns The claim result, previous timestamp and value, and locked response.
 */
export const lockWithDailyTimer = async (client: DrizzleClient, name: string) => {
  const timer = await getGameSetting(client, name);
  const prevTime = timer.time;
  const prevValue = timer.value;
  const now = new Date();
  const claim = isDifferentDay(now, prevTime)
    ? await client
        .update(gameSetting)
        .set({ value: 0, time: now })
        .where(and(eq(gameSetting.id, timer.id), eq(gameSetting.time, prevTime)))
    : undefined;
  const isNewDay = claim?.rowsAffected === 1;
  const response = isNewDay ? null : "Wait until the next day to run this again";
  return {
    isNewDay,
    prevTime,
    prevValue,
    response: Response.json(response, { status: 200 }),
  };
};

/**
 * Locks the game with a weekly timer.
 *
 * @param client
 * @param name
 * @returns
 */
export const lockWithWeeklyTimer = async (client: DrizzleClient, name: string) => {
  const timer = await getGameSetting(client, name);
  const prevTime = timer.time;
  const isNewWeek = getWeekNumber(new Date()) !== getWeekNumber(prevTime);
  let response: string | null = null;
  if (!isNewWeek) {
    response = "Wait until the next week to run this again";
  } else {
    await updateGameSetting(client, name, 0, new Date());
  }
  return {
    isNewWeek,
    prevTime,
    response: Response.json(response, { status: 200 }),
  };
};

/**
 * Locks the game with a monthly timer. Runs once per calendar month.
 *
 * @param client
 * @param name
 * @returns
 */
export const lockWithMonthlyTimer = async (client: DrizzleClient, name: string) => {
  const timer = await getGameSetting(client, name);
  const prevTime = timer.time;
  const now = new Date();
  const isNewMonth =
    now.getUTCFullYear() !== prevTime.getUTCFullYear() ||
    now.getUTCMonth() !== prevTime.getUTCMonth();
  let response: string | null = null;
  if (!isNewMonth) {
    response = "Wait until the next month to run this again";
  } else {
    await updateGameSetting(client, name, 0, now);
  }
  return {
    isNewMonth,
    prevTime,
    response: Response.json(response, { status: 200 }),
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
    const [days, hours, minutes, seconds] = getDaysHoursMinutesSeconds(
      timer.time.getTime() + deltaTime - Date.now(),
    );
    return Response.json(
      `Wait ${getTimeLeftStr(days, hours, minutes, seconds)} before running again`,
    );
  }
  return false;
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
  let settings = await client
    .select()
    .from(gameSetting)
    .where(inArray(gameSetting.name, DMG_SETTING_NAMES));

  // Find which settings are missing and insert them with defaults
  const existingNames = new Set(settings.map((s) => s.name));
  const missing = DMG_SETTING_NAMES.filter((n) => !existingNames.has(n));
  if (missing.length > 0) {
    const newSettings = missing.map((name) => ({
      name,
      time: addDays(new Date(), -30),
      value: DMG_SETTING_DEFAULTS[name] ?? 0,
    }));
    await initializeGameSettings(client, newSettings);
    // Return the saved values even if staff updated defaults during initialization.
    settings = await client
      .select()
      .from(gameSetting)
      .where(inArray(gameSetting.name, DMG_SETTING_NAMES));
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
