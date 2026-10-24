import * as Sentry from "@sentry/node";
import {
  type QueryAttribution,
  UNKNOWN_QUERY_ATTRIBUTION,
} from "@/libs/queryTelemetry";

/** Count executed procedures independently of trace sampling, with bounded attributes. */
export const measureTrpcCall = async <T extends { ok: boolean }>(
  call: { path: string; type: string; attribution?: QueryAttribution },
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
  if (call.type !== "query") return next();

  const attribution = call.attribution ?? UNKNOWN_QUERY_ATTRIBUTION;
  const attributes = {
    procedure: call.path,
    trigger: attribution.trigger,
    mutation_context: attribution.mutationContext,
  };
  recordMetric(() => metrics.count("trpc.query.fetch", 1, { attributes }));
  const started = performance.now();
  let outcome = "error";
  try {
    const result = await next();
    outcome = result.ok ? "success" : "error";
    return result;
  } finally {
    recordMetric(() =>
      metrics.distribution("trpc.query.duration", performance.now() - started, {
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
