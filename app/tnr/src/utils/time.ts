/**
 * Number of seconds passed since the given date
 */
export const secondsPassed = (date: Date) => {
  return Math.floor((new Date().getTime() - date.getTime()) / 1000);
};

/**
 * Current date plus the given number of seconds
 */
export const secondsFromNow = (seconds: number) => {
  return new Date(new Date().getTime() + seconds * 1000);
};
