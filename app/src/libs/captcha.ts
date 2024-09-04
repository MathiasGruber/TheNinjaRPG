import type { UserData } from "@/drizzle/schema";

export const showTrainingCapcha = (user: UserData) => {
  const trainings = user.dailyTrainings;
  if (trainings < 10) {
    return false;
  } else if (trainings < 30) {
    return trainings % 4 === 0;
  } else if (trainings < 40) {
    return trainings % 3 === 0;
  } else if (trainings < 50) {
    return trainings % 2 === 0;
  } else {
    return true;
  }
};
