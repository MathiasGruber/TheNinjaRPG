import * as Sentry from "@sentry/node";
import { parseUserRefreshCause } from "@/libs/userRefreshCauses";

/** Count executed procedures independently of trace sampling, with bounded attributes. */
export const measureTrpcCall = async <T extends { ok: boolean }>(
  call: { path: string; type: string; userRefreshCause?: string },
  next: () => Promise<T>,
  metrics: Pick<typeof Sentry.metrics, "count" | "distribution"> = Sentry.metrics,
) => {
  if (call.type === "mutation") {
    recordMetric(() =>
      metrics.count("trpc.mutation", 1, {
        attributes: { procedure: call.path },
      }),
    );
  }
  if (call.path !== "profile.getUser" || call.type !== "query") return next();

  const cause = parseUserRefreshCause(call.userRefreshCause);
  const causeType = cause.split(":", 1)[0]!;
  const attributes = { cause, cause_type: causeType };
  recordMetric(() => metrics.count("profile.get_user.fetch", 1, { attributes }));
  const started = performance.now();
  let outcome = "error";
  try {
    const result = await next();
    outcome = result.ok ? "success" : "error";
    return result;
  } finally {
    recordMetric(() =>
      metrics.distribution("profile.get_user.duration", performance.now() - started, {
        unit: "millisecond",
        attributes: { ...attributes, outcome },
      }),
    );
  }
};

const recordMetric = (record: () => void) => {
  try {
    record();
  } catch {
    // Diagnostics must never reject an action or replace its original error.
  }
};
