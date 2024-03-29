import { secondsPassed, secondsFromNow } from "@/utils/time";
import type { UserData } from "../../../drizzle/schema";

export const calcHealCost = (user: UserData) => {
  return (user.maxHealth - user.curHealth) / 10;
};

const healSecondsLeft = (user: UserData, timeDiff?: number) => {
  const seconds = secondsPassed(new Date(user.regenAt), timeDiff);
  const healedIn = Math.max(3 * 60 - seconds, 0);
  return healedIn;
};

export const calcHealFinish = (info: {
  user: UserData;
  timeDiff?: number;
  boost?: number;
}) => {
  const { user, timeDiff, boost } = info;
  const factor = (100 - (boost ?? 0)) / 100;
  const timeLeft = healSecondsLeft(user, timeDiff) * factor;
  const healedAt = secondsFromNow(timeLeft);
  return healedAt;
};
