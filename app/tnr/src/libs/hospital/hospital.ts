import type { UserData } from "@prisma/client/edge";
import { secondsPassed, secondsFromNow } from "../../utils/time";

export const calcHealCost = (user: UserData) => {
  return user.max_health - user.cur_health;
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
