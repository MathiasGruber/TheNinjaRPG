export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

export type JsonData =
  | string
  | number
  | boolean
  | { [x: string]: JsonData }
  | Array<JsonData>;
