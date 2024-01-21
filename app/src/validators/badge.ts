import { z } from "zod";

export const BadgeValidator = z.object({
  name: z.string().min(1).max(191),
  image: z.string().url(),
  description: z.string().min(1).max(512),
});

export type ZodBadgeType = z.infer<typeof BadgeValidator>;
