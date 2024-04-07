import { z } from "zod";

export const anbuCreateSchema = z.object({
  leaderId: z.string(),
  villageId: z.string(),
  name: z.string().trim().min(3).max(88),
});

export type AnbuCreateSchema = z.infer<typeof anbuCreateSchema>;

export const anbuRenameSchema = z.object({
  name: z.string().trim().min(3).max(88),
});

export type AnbuRenameSchema = z.infer<typeof anbuRenameSchema>;
