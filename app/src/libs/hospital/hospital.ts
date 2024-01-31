import { secondsPassed, secondsFromNow } from "@/utils/time";
import type { UserData } from "../../../drizzle/schema";

export const calcHealCost = (user: UserData) => {
  return (user.maxHealth - user.curHealth) / 10;
};

export const healSecondsLeft = (user: UserData, timeDiff?: number) => {
  const seconds = secondsPassed(new Date(user.regenAt), timeDiff);
  const healedIn = Math.max(3 * 60 - seconds, 0);
  return healedIn;
};

export const calcHealFinish = (user: UserData, timeDiff?: number) => {
  const timeLeft = healSecondsLeft(user, timeDiff);
  const healedAt = secondsFromNow(timeLeft);
  return healedAt;
};
