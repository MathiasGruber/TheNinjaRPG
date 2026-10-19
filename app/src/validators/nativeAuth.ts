import { z } from "zod";

const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const nativeAuthFlowSchema = z.object({ flowId: proof }).strict();
export const nativeAuthStartSchema = z
  .object({
    provider: z.enum(["google", "discord", "facebook"]),
    challenge: proof,
  })
  .strict();
export const nativeAuthExchangeSchema = nativeAuthFlowSchema
  .extend({ verifier: proof, code: proof })
  .strict();

export type NativeAuthProvider = z.infer<typeof nativeAuthStartSchema>["provider"];
