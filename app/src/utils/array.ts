export const getRandomElement = <T>(arr?: T[]) => {
  const length = arr?.length;
  if (length) {
    const idx = Math.floor(Math.random() * length);
    return arr?.[idx];
  } else {
    return undefined;
  }
};
