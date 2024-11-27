import { z } from "zod";

export const bgTypes = [
  "ocean",
  "ice",
  "dessert",
  "ground",
  "arena",
  "default",
] as const;

export const BgSchemaValidator = z.object({
  ocean: z.string().url().default(""),
  ice: z.string().url().default(""),
  dessert: z.string().url().default(""),
  ground: z.string().url().default(""),
  arena: z.string().url().default(""),
  default: z.string().url().default(""),
});

export type ZodBgSchemaType = z.infer<typeof BgSchemaValidator>;

export const BackgroundSchemaValidator = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(191),
  description: z.string().min(1).max(191),
  isActive: z.boolean().default(false),
  schema: BgSchemaValidator,
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type ZodBackgroundSchemaType = z.infer<typeof BackgroundSchemaValidator>;

export const BackgroundSchemaPartialValidator = BackgroundSchemaValidator.partial();

export type BackgroundSchemaPartial = z.infer<typeof BackgroundSchemaPartialValidator>;
