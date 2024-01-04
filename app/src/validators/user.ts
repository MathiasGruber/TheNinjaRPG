import { z } from "zod";
import { UserRoles } from "@/drizzle/constants";

export const updateUserSchema = z.object({
  role: z.enum(UserRoles),
});

export type UpdateUserSchema = z.infer<typeof updateUserSchema>;
