import { expect, it } from "bun:test";
import { diagnosticTrpcInput } from "@/server/utils/trpcInput";

it("redacts parental PIN inputs before diagnostics while retaining ordinary inputs", () => {
  const credentials = { pin: "012345", newPin: "543210" };
  expect(diagnosticTrpcInput("parentalControls.save", credentials)).toBe("[REDACTED]");
  expect(diagnosticTrpcInput("parentalControls.get", undefined)).toBe("[REDACTED]");
  const input = { conversationId: "example" };
  expect(diagnosticTrpcInput("comments.getConversationComments", input)).toBe(input);
  expect(diagnosticTrpcInput(undefined, undefined)).toBeUndefined();
});

it("redacts native authentication proofs and future handoff credentials", () => {
  const proof = { flowId: "flow", verifier: "private-proof", ticket: "private-ticket" };
  expect(diagnosticTrpcInput("nativeAuth.exchange", proof)).toBe("[REDACTED]");
  expect(diagnosticTrpcInput("nativeAuth.start", proof)).toBe("[REDACTED]");
});
