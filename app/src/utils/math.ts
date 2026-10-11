/**
 * min and max included
 */
export const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

/** An unpredictable fraction in [0, 1), available in both server and browser code. */
export const secureRandom = () => {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return (values[0] ?? 0) / 0x1_0000_0000;
};

/**
 * Rounds a number to a specified number of decimal places.
 * @param value - The number to round.
 * @param decimals - The number of decimal places to round to.
 * @returns The rounded number.
 */
export const round = (value: number, decimals = 2) => {
  return Number(`${Math.round(Number(`${value}e${decimals}`))}e-${decimals}`);
};

/**
 * Clamp a value into the inclusive [min, max] range.
 */
export const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Calculates percentage clamped between 0 and 100.
 * @param current - The current value.
 * @param max - The maximum value (divisor). Defaults to 1 if 0 to avoid division by zero.
 * @returns The percentage value between 0 and 100.
 */
export const calculatePercent = (current: number, max: number): number => {
  const safeMax = max || 1;
  return Math.min(100, Math.max(0, (current / safeMax) * 100));
};
