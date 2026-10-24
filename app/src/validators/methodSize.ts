import { z } from "zod";
import { MAX_METHOD_SIZE } from "@/drizzle/constants";

/**
 * Extra battlefield columns/rows on either side of each tile in the default footprint.
 * Wall methods rotate the axes with the wall (y lengthens it, x thickens it).
 * Callers accept a missing or null field as zero expansion for existing content.
 */
export const methodSizeSchema = z.object({
  x: z.number().int().min(0).max(MAX_METHOD_SIZE),
  y: z.number().int().min(0).max(MAX_METHOD_SIZE),
});
export type MethodSize = z.infer<typeof methodSizeSchema>;
