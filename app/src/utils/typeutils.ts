export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

export type JsonData =
  | string
  | number
  | boolean
  | { [x: string]: JsonData }
  | Array<JsonData>;

// Convert key null values to empty strings
export const setValueOnObj = <T, K extends keyof T>(obj: T, key: K, value: T[K]) => {
  obj[key] = value;
  return obj;
};

/**
 * Reset all fields on an object that are null to empty strings. Convenient
 * for forms, where null does not exist, but needs to be empty strings instead
 */
export const setNullsToEmptyStrings = (obj: { [key: string]: any } | undefined) => {
  if (obj) {
    let k: keyof typeof obj;
    for (k in obj) {
      if (obj[k] === null) setValueOnObj(obj, k, "");
    }
  }
};
