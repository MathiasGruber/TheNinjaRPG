# Query and mutation load attribution

The shared tRPC provider instruments its QueryClient and query/mutation caches once.
Existing and future callers use the ordinary tRPC/TanStack APIs without adding labels
at invalidation sites. Sentry Application Metrics are independent of trace sampling.

| Metric | Emitted by | Attributes | Meaning |
| --- | --- | --- | --- |
| `trpc.mutation` | Server | `procedure` | Mutation invocations reaching middleware after authentication, isolation and BotID guards; attempts rather than committed writes. |
| `trpc.query.invalidation` | Client | `target`, `mutation_context` | Calls to `invalidateQueries`, including repeated calls against already-invalidated, inactive or missing queries. The target is a procedure, router prefix, `all` or `unknown`. |
| `trpc.query.fetch` | Server | `procedure`, `trigger`, `mutation_context` | Actual query invocations reaching middleware, including retries, for every procedure. Cache hits and invalidations that reuse unfinished reads add no server execution. |
| `trpc.query.duration` | Server | `procedure`, `trigger`, `mutation_context`, `outcome` | Procedure wall time in milliseconds, including application work and database latency; not SQL CPU time or the sum of SQL durations. |

The existing Sentry Next.js request wrapper flushes server metrics after the response
through the platform's `waitUntil`; game logic does not await a telemetry request.
Client metrics use the existing browser SDK and can be absent when telemetry is blocked.
CDN cache hits do not reach server middleware and produce no server execution metric.

## Finding optimization opportunities

In Sentry, select **Explore → Metrics**, project `theninjarpg`, the production
environment and a consistent time window.

1. Sum `trpc.query.fetch`, group by `procedure`, and filter `trigger:invalidation` to
   rank queries reloaded after invalidation. Filter `procedure:profile.getUser` for
   the account query specifically.
2. Sum `trpc.query.invalidation` and group by `target` to find frequent invalidation
   calls, including router-wide and global calls. Compare with server executions:
   invalidation counts alone overstate database load when reads are deduplicated,
   queries are inactive or responses come from the CDN.
3. Group profile executions by `mutation_context`, then compare with `trpc.mutation`
   grouped by `procedure`. This provides mutation correlation, not proof of causality.
4. Compare query duration by the same dimensions. Count times average duration
   estimates total procedure wall time. Use PlanetScale Insights for the underlying
   SQL cost; parallel statements overlap in wall time.
5. Compare equal windows before and after an optimization, accounting for player
   activity and release changes. Metrics begin on deployment and do not backfill traces.

## Trigger and mutation context

- `initial`: a query has no successful cached result.
- `invalidation`: a fetch was scheduled by invalidation or follows a pending invalidation.
- `refetch`: an explicit QueryClient/tRPC utility refetch outside invalidation.
- `refresh`: other fetches of existing data, including polling, focus/reconnect,
  observer refetches and imperative fetches.
- `unknown`: older clients, direct callers or missing/unmatchable attribution.
- `mixed`: duplicate procedure calls in one batch have conflicting attribution.

`mutation_context` records a single procedure whose success/error callbacks are
settling, or that just completed in the same event-loop turn. It also covers the
continuation immediately after `await mutateAsync()`. Different overlapping mutation
paths produce `multiple`; no observed context produces `none`. `unknown` covers
unrecognized mutation metadata. An unrelated timer or realtime event can fire while
an async mutation callback awaits other work, so this field is a correlation hint.
The generic hook cannot infer exact timer, websocket or caller identity.

## Collection contract

The tracker scopes scheduling per QueryClient, retains pending invalidations and
snapshots attribution into each tRPC operation before retrying and batching. Cache
matching includes query inputs and handles infinite-query cursors, but inputs and
query-key hashes are never sent to metrics. Router/global invalidations require no
special handling at call sites. Predicates retain their existing evaluation behavior.

A bounded diagnostic header carries attribution for batched query paths. Server
validation uses the registered router's procedure types, with no manual allowlist.
Unknown query names, mutation names, triggers and oversized/malformed headers cannot
create arbitrary server metric labels or reject game requests. Attribution grants
no authority and includes no player identifiers or request/response payloads.

Counters are unsampled, but delivery remains best effort. Budget roughly one record
per mutation, one per invalidation call and two per server query execution. Broader
query coverage increases volume compared with observing only the account query.
