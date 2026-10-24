import { describe, expect, it, mock } from "bun:test";
import type * as Sentry from "@sentry/node";
import { measureTrpcCall } from "@/server/utils/trpcMetrics";

const recorder = () => ({ count: mock<typeof Sentry.metrics.count>(() => {}), distribution: mock<typeof Sentry.metrics.distribution>(() => {}) });

describe("tRPC load metrics", () => {
  it("counts every executed mutation without putting arguments or results in attributes", async () => {
    const metrics = recorder();
    const result = { ok: true, data: { success: false, message: "Rejected", userId: "private" } };
    const next = mock(async () => result);
    expect(await measureTrpcCall({ path: "item.consume", type: "mutation" }, next, metrics)).toBe(result);
    expect(next).toHaveBeenCalledTimes(1);
    expect(metrics.count).toHaveBeenCalledWith("trpc.mutation", 1, { attributes: { procedure: "item.consume" } });
    expect(metrics.distribution).not.toHaveBeenCalled();
  });

  it("does not instrument unrelated queries", async () => {
    const metrics = recorder();
    await measureTrpcCall({ path: "profile.getDashboard", type: "query" }, async () => ({ ok: true }), metrics);
    expect(metrics.count).not.toHaveBeenCalled();
    expect(metrics.distribution).not.toHaveBeenCalled();
  });

  it("counts a getUser execution and measures wall time using its validated cause", async () => {
    const metrics = recorder();
    await measureTrpcCall({ path: "profile.getUser", type: "query", userRefreshCause: "timer:energy_queue" }, async () => ({ ok: true }), metrics);
    expect(metrics.count).toHaveBeenCalledWith("profile.get_user.fetch", 1, {
      attributes: { cause: "timer:energy_queue", cause_type: "timer" },
    });
    expect(metrics.distribution).toHaveBeenCalledWith("profile.get_user.duration", expect.any(Number), {
      unit: "millisecond", attributes: { cause: "timer:energy_queue", cause_type: "timer", outcome: "success" },
    });
    expect(metrics.distribution.mock.calls[0]![1]).toBeGreaterThanOrEqual(0);
  });

  it.each([undefined, "player-secret", "mutation:arbitrary.path"])("bounds untrusted and absent causes: %p", async (userRefreshCause) => {
    const metrics = recorder();
    await measureTrpcCall({ path: "profile.getUser", type: "query", userRefreshCause }, async () => ({ ok: false }), metrics);
    expect(metrics.count).toHaveBeenCalledWith("profile.get_user.fetch", 1, {
      attributes: { cause: "unknown:request", cause_type: "unknown" },
    });
    expect(metrics.distribution).toHaveBeenCalledWith("profile.get_user.duration", expect.any(Number), {
      unit: "millisecond", attributes: { cause: "unknown:request", cause_type: "unknown", outcome: "error" },
    });
  });

  it("retains the original exception while measuring failed getUser work", async () => {
    const metrics = recorder();
    const error = new Error("database unavailable");
    await expect(measureTrpcCall({ path: "profile.getUser", type: "query" }, async () => { throw error; }, metrics)).rejects.toBe(error);
    expect(metrics.count).toHaveBeenCalledTimes(1);
    expect(metrics.distribution).toHaveBeenCalledTimes(1);
  });

  it("never rejects a game action when telemetry fails", async () => {
    const metrics = { count: () => { throw new Error("telemetry"); }, distribution: () => { throw new Error("telemetry"); } };
    await expect(measureTrpcCall({ path: "profile.getUser", type: "query" }, async () => ({ ok: true }), metrics)).resolves.toEqual({ ok: true });
    await expect(measureTrpcCall({ path: "item.consume", type: "mutation" }, async () => ({ ok: true }), metrics)).resolves.toEqual({ ok: true });
  });
});
