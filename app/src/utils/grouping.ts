/**
 * Group objects by key
 */
export const groupBy = <T, K extends keyof T>(value: T[], key: K) =>
  value.reduce((acc, curr) => {
    if (acc.get(curr[key])) return acc;
    acc.set(
      curr[key],
      value.filter((elem) => elem[key] === curr[key]),
    );
    return acc;
  }, new Map<T[K], T[]>());

/**
 * Return unique objects in array
 */
export const getUnique = <T, K extends keyof T>(array: T[], key: K) => {
  return [
    ...new Map(
      array.filter(Boolean).map((element) => [element[key], element]),
    ).values(),
  ];
};
