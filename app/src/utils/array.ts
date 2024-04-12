/**
 * Returns a random element from the given array.
 *
 * @template T - The type of elements in the array.
 * @param arr - The array from which to select a random element.
 * @returns - A random element from the array, or undefined if the array is empty.
 */
export const getRandomElement = <T>(arr?: T[] | readonly T[]) => {
  const length = arr?.length;
  if (length) {
    const idx = Math.floor(Math.random() * length);
    return arr?.[idx];
  } else {
    return undefined;
  }
};
