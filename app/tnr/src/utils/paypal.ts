export const reps2dollars = (reps: number) => {
  return Math.ceil(Math.pow(reps, 1 / 1.305) * 10) / 10;
};

export const dollars2reps = (dollars: number) => {
  return Math.round(Math.pow(dollars, 1.305));
};
