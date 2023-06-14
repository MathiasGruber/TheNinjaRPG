import type { PrismaClient, Prisma } from "@prisma/client";

export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

export type PrismaTransactionClient = Omit<
  PrismaClient<
    Prisma.PrismaClientOptions,
    never,
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation | undefined
  >,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use"
>;

export type JsonData =
  | string
  | number
  | boolean
  | { [x: string]: JsonData }
  | Array<JsonData>;
