/**
 * A consistent not-random number generator between 0 and 1
 */
export const consistentRandNumber = (i: number) => {
  const x = Math.sin(i++) * 10000;
  return x - Math.floor(x);
};
