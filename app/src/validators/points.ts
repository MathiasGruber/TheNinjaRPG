import { z } from "zod";

export const buyRepsSchema = z.object({
  reputationPoints: z.number().min(5).max(1000),
});

export type BuyRepsSchema = z.infer<typeof buyRepsSchema>;

export const searchPaypalSchema = z
  .object({
    text: z.string().min(4).max(255),
  })
  .strict()
  .required();

export type SearchPaypalSchema = z.infer<typeof searchPaypalSchema>;
