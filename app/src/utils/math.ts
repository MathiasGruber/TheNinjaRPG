/**
 * min and max included
 */
export const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

/**
 * Rounds a number to a specified number of decimal places.
 * @param value - The number to round.
 * @param decimals - The number of decimal places to round to.
 * @returns The rounded number.
 */
export const round = (value: number, decimals: number = 2) => {
  return Number(Math.round(Number(value + "e" + decimals)) + "e-" + decimals);
};
