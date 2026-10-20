import { createHmac, timingSafeEqual } from "node:crypto";
import { ENERGY_QUEUE_CAPTCHA_TTL_MS } from "@/drizzle/constants";
import { env } from "@/env/server.mjs";
import type { EnergyQueueCaptchaVerification } from "@/validators/train";

type Scope = {
  userId: string;
  sessionId: string | null | undefined;
  now?: number;
  secret?: string;
};

/** The Clerk key derives a separate signing domain; no pass is issued without a session. */
const signature = (
  userId: string,
  sessionId: string,
  expiresAt: number,
  secret: string,
) =>
  createHmac("sha256", secret)
    .update(JSON.stringify(["energy-queue-captcha-v1", userId, sessionId, expiresAt]))
    .digest("base64url");

export const issueEnergyQueueCaptcha = ({
  userId,
  sessionId,
  now = Date.now(),
  secret = env.CLERK_SECRET_KEY,
}: Scope): EnergyQueueCaptchaVerification | null => {
  if (!sessionId || !secret) return null;
  const expiresAt = now + ENERGY_QUEUE_CAPTCHA_TTL_MS;
  return {
    token: `${expiresAt}.${signature(userId, sessionId, expiresAt, secret)}`,
    expiresAt,
  };
};

export const verifyEnergyQueueCaptcha = (
  token: string | undefined,
  { userId, sessionId, now = Date.now(), secret = env.CLERK_SECRET_KEY }: Scope,
): EnergyQueueCaptchaVerification | null => {
  if (!token || !sessionId || !secret) return null;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const expiresAt = Number(match[1]);
  // Bound even a correctly signed pass; reuse never extends the original deadline.
  if (expiresAt <= now || expiresAt > now + ENERGY_QUEUE_CAPTCHA_TTL_MS) return null;
  const expected = Buffer.from(signature(userId, sessionId, expiresAt, secret));
  const actual = Buffer.from(match[2] ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? { token, expiresAt }
    : null;
};
