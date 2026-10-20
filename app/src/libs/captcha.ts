import {
  TRAINING_CAPTCHA_INTERVAL,
  TRAINING_CAPTCHA_MIN_TRAININGS,
} from "@/drizzle/constants";
import type { UserData } from "@/drizzle/schema";
import { getUserFederalStatus } from "@/utils/paypal";

/**
 * Whether the next stat, Energy queue, mastery or elemental training needs a captcha.
 * Shared by the training page and `train` router so both ask at the same counts: none
 * below the daily minimum, then at every Nth daily training for the user's federal tier.
 * `dailyTrainings` is capped at `MAX_DAILY_TRAININGS`, which bounds daily volume.
 */
export const showTrainingCapcha = (
  user: Pick<UserData, "dailyTrainings" | "staffAccount" | "federalStatus">,
) => {
  const trainings = user.dailyTrainings;
  if (trainings < TRAINING_CAPTCHA_MIN_TRAININGS) return false;
  return trainings % TRAINING_CAPTCHA_INTERVAL[getUserFederalStatus(user)] === 0;
};
