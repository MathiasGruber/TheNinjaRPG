export const groupBy = <T, K extends keyof T>(value: T[], key: K) =>
  value.reduce((acc, curr) => {
    if (acc.get(curr[key])) return acc;
    acc.set(
      curr[key],
      value.filter((elem) => elem[key] === curr[key])
    );
    return acc;
  }, new Map<T[K], T[]>());
