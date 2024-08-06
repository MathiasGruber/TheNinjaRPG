import { gameSetting } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDaysHoursMinutesSeconds, getTimeLeftStr } from "@/utils/time";
import { secondsPassed } from "@/utils/time";
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
    setting = { id: nanoid(), name: name, time: new Date(), value: 0 };
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
 * Checks the game timer and returns a response indicating how much time is left before the game can be run again.
 * @param res - The NextApiResponse object used to send the response.
 * @param hours - The number of hours for the game timer.
 * @returns A JSON response indicating the time left before the game can be run again.
 */
export const checkGameTimer = async (client: DrizzleClient, hours: number) => {
  const timer = await getGameSetting(client, `timer-${hours}h`);
  const deltaTime = 1000 * 60 * 60 * hours * 0.99;
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
