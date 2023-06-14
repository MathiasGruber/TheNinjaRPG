import { secondsPassed, secondsFromNow } from "../../utils/time";
import type { UserData } from "../../../drizzle/schema";

export const calcHealCost = (user: UserData) => {
  return user.maxHealth - user.curHealth;
};

export const healSecondsLeft = (user: UserData) => {
  const seconds = secondsPassed(new Date(user.regenAt));
  const healedIn = Math.max(15 * 60 - seconds, 0);
  return healedIn;
};

export const calcHealFinish = (user: UserData) => {
  const timeLeft = healSecondsLeft(user);
  const healedAt = secondsFromNow(timeLeft);
  return healedAt;
};
