import { z } from "zod";

/** A string preserves leading zeroes in six-digit PINs. */
export const parentalPinSchema = z.string().regex(/^\d{6}$/, "Enter a six-digit PIN");
/** Every save, including disabling controls, supplies a PIN and the loaded version. */
export const parentalSettingsSchema = z.object({
  enabled: z.boolean(),
  tavernDisabled: z.boolean(),
  privateMessages: z.enum(["EVERYONE", "APPROVED", "NONE"]),
  approvedUserIds: z.array(z.string().min(1).max(191)).max(50),
  pin: parentalPinSchema,
  newPin: parentalPinSchema.optional(),
  version: z.number().int().nonnegative(),
});
