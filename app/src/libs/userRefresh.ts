import type { InvalidateOptions, Query, QueryClient } from "@tanstack/react-query";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "@/api/root";
import {
  parseUserRefreshCause,
  USER_REFRESH_CAUSE_HEADER,
  type UserRefreshCause,
} from "@/libs/userRefreshCauses";

let currentCause: UserRefreshCause | undefined;

/** Scope only the synchronous fetch scheduling; async callers label the call after awaiting. */
export const withUserRefreshCause = <T>(cause: UserRefreshCause, run: () => T): T => {
  const previous = currentCause;
  currentCause = cause;
  try {
    return run();
  } finally {
    currentCause = previous;
  }
};

export const invalidateUserQuery = (
  cause: UserRefreshCause,
  invalidate: (
    input?: undefined,
    filters?: undefined,
    options?: InvalidateOptions,
  ) => Promise<void>,
) =>
  withUserRefreshCause(cause, () => {
    // TanStack forwards refetch options to Query.fetch. A distinct meta object makes a
    // paused replacement publish a fetch event even when its fetchStatus never became idle.
    const options: InvalidateOptions & {
      meta: { userRefreshCause: UserRefreshCause };
    } = {
      meta: { userRefreshCause: cause },
    };
    return invalidate(undefined, undefined, options);
  });

/** Keep attribution with the query through offline pauses, deduplication and retries. */
export const createUserRefreshTracker = (client: QueryClient) => {
  const pendingCauses = new WeakMap<Query, UserRefreshCause>();
  const fetchCauses = new WeakMap<Query, UserRefreshCause>();
  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || !isUserQuery(event.query)) return;
    const { query, action } = event;
    if (action.type === "invalidate") {
      pendingCauses.set(query, currentCause ?? "unknown:invalidation");
    } else if (action.type === "fetch") {
      fetchCauses.set(
        query,
        currentCause ??
          pendingCauses.get(query) ??
          (query.state.dataUpdateCount === 0 ? "initial:load" : "automatic:refresh"),
      );
      pendingCauses.delete(query);
    } else if (action.type === "success") {
      // An invalidation that reused an unfinished initial fetch has caused no new read.
      pendingCauses.delete(query);
    }
  });
  return {
    capture: (): UserRefreshCause => {
      const query = client.getQueryCache().getAll().find(isUserQuery);
      // Cancelling an in-flight cached read can restart it without another fetch event.
      if (query && currentCause) {
        fetchCauses.set(query, currentCause);
        pendingCauses.delete(query);
      }
      return query && query.state.fetchStatus !== "idle"
        ? (fetchCauses.get(query) ?? "unknown:request")
        : "unknown:request";
    },
  };
};

/** Snapshot before any asynchronous link or batching can overlap another fetch. */
export const userRefreshCauseLink =
  (
    tracker: Pick<ReturnType<typeof createUserRefreshTracker>, "capture">,
  ): TRPCLink<AppRouter> =>
  () =>
  ({ op, next }) =>
    next(
      op.type === "query" && op.path === "profile.getUser"
        ? { ...op, context: { ...op.context, userRefreshCause: tracker.capture() } }
        : op,
    );

/** A batch can contain cancelled/restarted reads; never assign one read's cause to another. */
export const userRefreshHeaders = (
  operations: readonly { path: string; context: Record<string, unknown> }[],
): Record<string, string> => {
  const causes = operations
    .filter((op) => op.path === "profile.getUser")
    .map((op) => parseUserRefreshCause(op.context.userRefreshCause));
  if (causes.length === 0) return {};
  return {
    [USER_REFRESH_CAUSE_HEADER]: causes.every((cause) => cause === causes[0])
      ? causes[0]!
      : "unknown:mixed_batch",
  };
};

const isUserQuery = (query: Query) => {
  const path = query.queryKey[0];
  return (
    Array.isArray(path) &&
    path.length === 2 &&
    path[0] === "profile" &&
    path[1] === "getUser"
  );
};
