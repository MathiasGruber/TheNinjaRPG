# Database load attribution

Sentry Application Metrics record procedure counts independently of trace sampling.
The existing Sentry Next.js request wrapper flushes buffered metrics after the response
through the platform's `waitUntil`; no telemetry request is awaited by game logic.

| Metric | Type | Attributes | Meaning |
| --- | --- | --- | --- |
| `trpc.mutation` | Counter | `procedure` | Mutation invocations that reach the Sentry middleware after the existing authentication, isolation and BotID guards. Counts attempts, including rejected inputs/business outcomes and failed executions, rather than committed writes. |
| `profile.get_user.fetch` | Counter | `cause`, `cause_type` | Actual `profile.getUser` invocations reaching that middleware, including initial loads and retries. Invalidations that reuse an unfinished fetch or never fetch add no server execution. |
| `profile.get_user.duration` | Distribution, milliseconds | `cause`, `cause_type`, `outcome` | Server wall time inside the instrumented procedure. Includes application work and database latency; it is not database CPU time or the sum of SQL durations. |

## Finding optimization opportunities

In Sentry, select **Explore → Metrics**, the `theninjarpg` project, the production
environment and a consistent time window.

1. Select `profile.get_user.fetch`, sum the counter values and group by `cause`.
   Sort descending to find the causes producing the most server reads.
2. Select `trpc.mutation`, sum the counter values and group by `procedure`.
   Compare a mutation's volume with its attributed profile reads. A high mutation
   count alone does not imply many invalidations or reads.
3. Compare the profile duration distribution by the same cause. Fetch count times
   average duration estimates total **procedure wall time**; use PlanetScale Insights
   to establish the database cost of the underlying queries before estimating SQL
   savings. Parallel SQL statements can overlap in wall time.
4. Compare equal windows before and after an optimization, accounting for player
   activity and release changes. Metrics begin on deployments containing this code;
   they do not backfill historical traces.

Counters are unsampled by the trace sampler, but telemetry delivery remains best
effort. They are operational measurements, not an accounting ledger.

## Refresh causes

`mutation:<procedure>` identifies a known mutation callback. `feature:<name>` identifies
a refresh helper shared by several related mutation callbacks, without guessing which
one ran. Timer, realtime, native-store, upload, manual retry and recovery paths have
their own labels. `cache:*` labels identify fallback reconciliation after an unsafe
or incomplete local patch; these labels identify the fallback reason rather than the
mutation that supplied the patch.

`initial:load` identifies a query with no successful cached result.
`automatic:refresh` covers observer refreshes such as the five-minute polling interval,
focus and reconnect. `unknown:invalidation` exposes an unlabelled cache invalidation.
`unknown:request` includes older clients, direct callers and missing/invalid attribution.
When a batch contains profile requests with conflicting causes, `unknown:mixed_batch`
avoids assigning one request's label to another.

Use `invalidateUserQuery(cause, utils.profile.getUser.invalidate)` for explicit
profile invalidation. Use `withUserRefreshCause(cause, () => ...)` for direct fetches,
observer refetches, global invalidation or cache reconciliation. Place the wrapper
around the cache call itself, after any awaited work: attribution scopes only
synchronous scheduling and never stays globally active across an `await`.

The query tracker retains a deferred invalidation's cause until a fetch starts and
snapshots the cause into the tRPC operation before retrying or batching. A diagnostic
header conveys that snapshot to the server. Causes must be added to the fixed
`USER_REFRESH_CAUSES` allowlist in `app/src/libs/userRefreshCauses.ts`; arbitrary header
values are discarded. Attributes contain no player identifiers, routes with IDs,
request inputs or response payloads. Attribution is diagnostic and grants no authority.
