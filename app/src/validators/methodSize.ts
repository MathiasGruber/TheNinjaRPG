import { z } from "zod";
import { MAX_METHOD_SIZE } from "@/drizzle/constants";

/** Extra columns/rows on either side of each tile in the method's default footprint. */
export const methodSizeSchema = z.object({
  x: z.number().int().min(0).max(MAX_METHOD_SIZE),
  y: z.number().int().min(0).max(MAX_METHOD_SIZE),
});
export type MethodSize = z.infer<typeof methodSizeSchema>;
