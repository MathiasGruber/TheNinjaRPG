import { gameTimers } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { nanoid } from "nanoid";

export const getTimer = async (timerName: string) => {
  let timer = await drizzleDB.query.gameTimers.findFirst({
    where: eq(gameTimers.name, timerName),
  });
  if (!timer) {
    timer = {
      id: nanoid(),
      name: timerName,
      time: new Date(),
    };
    await drizzleDB.insert(gameTimers).values(timer);
  }
  return timer;
};

export const updateTimer = async (timerName: string, time: Date) => {
  const timer = await getTimer(timerName);
  await drizzleDB
    .update(gameTimers)
    .set({ time })
    .where(eq(gameTimers.name, timer.name));
};
