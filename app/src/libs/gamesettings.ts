import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { gameSetting } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDaysHoursMinutesSeconds, getTimeLeftStr } from "@/utils/time";
import { secondsPassed, addDays } from "@/utils/time";
import { round } from "@/utils/math";
import type { DrizzleClient } from "@/server/db";
import type { GameSetting } from "@/drizzle/schema";

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
    setting = { id: nanoid(), name: name, time: addDays(new Date(), -2), value: 0 };
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
 * Locks the game with a timer based on the specified frequency and unit.
 *
 * @param client - The DrizzleClient instance to interact with the game settings.
 * @param frequency - The frequency value for the timer.
 * @param unit - The unit of time for the frequency (default is "h" for hours).
 * @param prefix - The prefix to use for the timer identifier (default is "timer").
 * @returns A promise that resolves to the response from the checkGameTimer function.
 */
export const lockWithGameTimer = async (
  client: DrizzleClient,
  frequency: number,
  unit = "h",
  prefix = "timer",
) => {
  const response = await checkGameTimer(client, frequency, unit, prefix);
  const idx = `${prefix}-${frequency}${unit}`;
  if (!response) {
    await updateGameSetting(client, idx, 0, new Date());
  }
  return response;
};

/**
 * Checks the game timer and returns a response indicating how much time is left before the game can be run again.
 * @param res - The NextApiResponse object used to send the response.
 * @param hours - The number of hours for the game timer.
 * @returns A JSON response indicating the time left before the game can be run again.
 */
export const checkGameTimer = async (
  client: DrizzleClient,
  hours: number,
  unit = "h",
  prefix = "timer",
) => {
  const timer = await getGameSetting(client, `${prefix}-${hours}${unit}`);
  const deltaTime = 1000 * 60 * 60 * hours * 0.9999;
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
 * Convenience method for fetching a current value boost from the settings if still active,
 * otherwise return null
 * @param settingName
 * @param settings
 */
export const getGameSettingBoost = (settingName: string, settings: GameSetting[]) => {
  const setting = settings.find((s) => s.name === settingName);
  if (setting) {
    const secondsLeft = -secondsPassed(setting.time);
    const daysLeft = round(secondsLeft / (24 * 3600), 1);
    if (secondsLeft > 0 && setting.value > 0) {
      return { value: setting.value, daysLeft, secondsLeft };
    }
  }
  return null;
};

/**
 * Handles errors that occur during endpoint processing.
 * Logs the error to the console and returns an appropriate HTTP response.
 *
 * @param cause - The error that occurred. This can be of any type.
 * @returns A JSON response with the error details and the appropriate HTTP status code.
 *          If the error is an instance of TRPCError, the response will contain the error details
 *          and the corresponding HTTP status code. Otherwise, it returns a generic "Internal server error"
 *          message with a 500 status code.
 */
export const handleEndpointError = (cause: unknown) => {
  console.error(cause);
  if (cause instanceof TRPCError) {
    // An error from tRPC occured
    const httpCode = getHTTPStatusCodeFromError(cause);
    return Response.json(cause, { status: httpCode });
  }
  // Another error occured
  return Response.json("Internal server error", { status: 500 });
};
