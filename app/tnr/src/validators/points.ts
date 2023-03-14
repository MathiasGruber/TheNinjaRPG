import { z } from "zod";

export const buyRepsSchema = z.object({
  reputation_points: z.number().min(5).max(1000),
});

export type BuyRepsSchema = z.infer<typeof buyRepsSchema>;
