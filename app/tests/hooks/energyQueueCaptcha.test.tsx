import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { useEnergyQueueCaptcha } from "@/hooks/energyQueueCaptcha";
import { ensureDom } from "../setup-dom.mjs";

beforeEach(() => { ensureDom(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Energy queue pass ownership", () => {
  it("expires on the server deadline even with a client clock offset", () => {
    const { result } = renderHook(() => useEnergyQueueCaptcha("one", "session", 60_000));
    act(() => result.current.onCaptchaVerification({ token: "pass", expiresAt: Date.now() - 60_000 + 1_000 }));
    expect(result.current.getCaptchaToken()).toBe("pass");
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.getCaptchaToken()).toBeUndefined();
  });

  it.each([
    { userId: "two", sessionId: "session" },
    { userId: "one", sessionId: "other-session" },
    { userId: "one", sessionId: undefined },
  ])("discards a pass after ownership changes to $userId / $sessionId", (changed) => {
    const original = { userId: "one", sessionId: "session" as string | undefined };
    const { result, rerender } = renderHook(({ userId, sessionId }) => useEnergyQueueCaptcha(userId, sessionId, 0), { initialProps: original });
    act(() => result.current.onCaptchaVerification({ token: "pass", expiresAt: Date.now() + 600_000 }));
    expect(result.current.getCaptchaToken()).toBe("pass");
    rerender(changed);
    expect(result.current.getCaptchaToken()).toBeUndefined();
    rerender(original);
    expect(result.current.getCaptchaToken()).toBeUndefined();
  });

  it("clears a rejected pass and forgets it on remount", () => {
    const first = renderHook(() => useEnergyQueueCaptcha("one", "session", 0));
    act(() => first.result.current.onCaptchaVerification({ token: "pass", expiresAt: Date.now() + 600_000 }));
    act(() => first.result.current.onCaptchaVerification(null));
    expect(first.result.current.getCaptchaToken()).toBeUndefined();
    act(() => first.result.current.onCaptchaVerification({ token: "pass", expiresAt: Date.now() + 600_000 }));
    first.unmount();
    const second = renderHook(() => useEnergyQueueCaptcha("one", "session", 0));
    expect(second.result.current.getCaptchaToken()).toBeUndefined();
  });
});
