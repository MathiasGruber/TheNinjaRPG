import { describe, expect, it } from "bun:test";
import { ENERGY_QUEUE_CAPTCHA_TTL_MS } from "@/drizzle/constants";
import { issueEnergyQueueCaptcha, verifyEnergyQueueCaptcha } from "@/server/utils/energyQueueCaptcha";

const scope = { userId: "trainee", sessionId: "session-one", secret: "test-signing-key", now: 1_792_500_000_000 };

describe("Energy queue verification", () => {
  it("reuses a solved challenge without extending its deadline", () => {
    const proof = issueEnergyQueueCaptcha(scope)!;
    expect(proof.expiresAt).toBe(scope.now + ENERGY_QUEUE_CAPTCHA_TTL_MS);
    expect(verifyEnergyQueueCaptcha(proof.token, { ...scope, now: scope.now + 60_000 })).toEqual(proof);
    expect(verifyEnergyQueueCaptcha(proof.token, { ...scope, now: proof.expiresAt - 1 })).toEqual(proof);
    expect(verifyEnergyQueueCaptcha(proof.token, { ...scope, now: proof.expiresAt })).toBeNull();
  });

  it("rejects other accounts, sessions, signing keys and missing authentication", () => {
    const proof = issueEnergyQueueCaptcha(scope)!;
    for (const changed of [{ userId: "other" }, { sessionId: "other-session" }, { sessionId: null }, { secret: "rotated-key" }, { secret: "" }]) {
      expect(verifyEnergyQueueCaptcha(proof.token, { ...scope, ...changed })).toBeNull();
    }
    expect(issueEnergyQueueCaptcha({ ...scope, sessionId: undefined })).toBeNull();
    expect(issueEnergyQueueCaptcha({ ...scope, secret: "" })).toBeNull();
  });

  it("rejects malformed, tampered and future-dated passes", () => {
    const proof = issueEnergyQueueCaptcha(scope)!;
    for (const token of [undefined, "", "anything", proof.token + "x", proof.token.replace(/^\d/, "9"), `${proof.expiresAt + 1}.${proof.token.split(".")[1]}`]) {
      expect(verifyEnergyQueueCaptcha(token, scope)).toBeNull();
    }
    expect(verifyEnergyQueueCaptcha(proof.token, { ...scope, now: scope.now - 1 })).toBeNull();
  });
});
