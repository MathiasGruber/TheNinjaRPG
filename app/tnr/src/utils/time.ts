/**
 * Number of seconds passed since the given date
 */
export const secondsPassed = (date: Date) => {
  return Math.floor((new Date().getTime() - date.getTime()) / 1000);
};
