import { afterEach, describe, expect, it } from "bun:test";
import { onlineManager, QueryClient, QueryObserver, type InvalidateOptions } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, retryLink } from "@trpc/client";
import { waitFor } from "@testing-library/react";
import superjson from "superjson";
import type { AppRouter } from "@/api/root";
import {
  createUserRefreshTracker,
  invalidateUserQuery,
  userRefreshCauseLink,
  userRefreshHeaders,
  withUserRefreshCause,
} from "@/libs/userRefresh";
import {
  parseUserRefreshCause,
  USER_REFRESH_CAUSE_HEADER,
} from "@/libs/userRefreshCauses";

const key = [["profile", "getUser"], { type: "query" }];
const closes: (() => void)[] = [];
const setup = (cached = true, fetch?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.mount();
  const tracker = createUserRefreshTracker(client);
  const requests: string[] = [];
  if (cached) client.setQueryData(key, { userData: { money: 100 } });
  const trpc = createTRPCClient<AppRouter>({ links: [
    userRefreshCauseLink(tracker),
    retryLink({ retry: ({ attempts }) => attempts < 2, retryDelayMs: () => 0 }),
    httpBatchLink({
      url: "http://localhost/api/trpc",
      transformer: superjson,
      headers: ({ opList }) => userRefreshHeaders(opList),
      fetch: async (url, init) => {
        requests.push(new Headers(init?.headers).get(USER_REFRESH_CAUSE_HEADER)!);
        return fetch ? fetch(url, init) : Response.json([
          { result: { data: superjson.serialize({ userData: { money: 90 } }) } },
        ]);
      },
    }),
  ] });
  const options = { queryKey: key, staleTime: Infinity, queryFn: () => trpc.profile.getUser.query() };
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  closes.push(() => { unsubscribe(); client.unmount(); client.clear(); });
  const invalidate = (_input?: undefined, _filters?: undefined, options?: InvalidateOptions) =>
    client.invalidateQueries({ queryKey: key }, options);
  return { client, requests, tracker, options, invalidate };
};

afterEach(() => {
  for (const close of closes.splice(0)) close();
  onlineManager.setOnline(true);
});

describe("user query refresh attribution", () => {
  it("labels the initial read and counts no fetch for a fresh cache hit", async () => {
    const test = setup(false);
    await test.client.fetchQuery(test.options);
    expect(test.requests).toEqual(["initial:load"]);
    await withUserRefreshCause("mutation:item.consume", () => test.client.fetchQuery(test.options));
    expect(test.requests).toHaveLength(1);
  });

  it("labels an actual refetch scheduled after an asynchronous mutation callback", async () => {
    const test = setup();
    await Promise.resolve();
    await invalidateUserQuery("mutation:item.consume", () => test.client.invalidateQueries({ queryKey: key }));
    expect(test.requests).toEqual(["mutation:item.consume"]);
    await test.client.refetchQueries({ queryKey: key });
    expect(test.requests).toEqual(["mutation:item.consume", "automatic:refresh"]);
  });

  it("keeps the initial cause when an invalidation deduplicates into its in-flight read", async () => {
    let release!: () => void;
    let reads = 0;
    const test = setup(false, async () => {
      if (++reads === 1) await new Promise<void>((resolve) => { release = resolve; });
      return Response.json([{ result: { data: superjson.serialize({ userData: {} }) } }]);
    });
    await waitFor(() => expect(test.requests).toHaveLength(1));
    const invalidation = invalidateUserQuery("timer:energy_queue", () => test.client.invalidateQueries({ queryKey: key }));
    release();
    await invalidation;
    expect(test.requests).toEqual(["initial:load"]);
    await test.client.refetchQueries({ queryKey: key });
    expect(test.requests).toEqual(["initial:load", "automatic:refresh"]);
  });

  it("preserves an inactive invalidation until the query actually fetches", async () => {
    const test = setup();
    await withUserRefreshCause("realtime:quest_team", () =>
      test.client.invalidateQueries({ queryKey: key, refetchType: "none" }),
    );
    expect(test.requests).toEqual([]);
    await test.client.fetchQuery(test.options);
    expect(test.requests).toEqual(["realtime:quest_team"]);
  });

  it("drops a deferred invalidation when a cache write reconciles it", async () => {
    const test = setup();
    await withUserRefreshCause("realtime:quest_team", () =>
      test.client.invalidateQueries({ queryKey: key, refetchType: "none" }),
    );
    test.client.setQueryData(key, { userData: { money: 80 } });
    await test.client.refetchQueries({ queryKey: key });
    expect(test.requests).toEqual(["automatic:refresh"]);
  });

  it("keeps a cause through an offline pause without leaking another client's cause", async () => {
    const first = setup();
    const second = setup();
    onlineManager.setOnline(false);
    const a = invalidateUserQuery("timer:energy_queue", () => first.client.invalidateQueries({ queryKey: key }));
    const b = invalidateUserQuery("realtime:battle_ended", () => second.client.invalidateQueries({ queryKey: key }));
    expect(first.requests).toEqual([]);
    expect(second.requests).toEqual([]);
    onlineManager.setOnline(true);
    await Promise.all([a, b]);
    // invalidateQueries settles immediately while paused; resuming the transport is later.
    await waitFor(() => {
      expect(first.requests).toEqual(["timer:energy_queue"]);
      expect(second.requests).toEqual(["realtime:battle_ended"]);
    });
  });

  it("preserves the cause on every transport retry that reaches the server", async () => {
    let attempts = 0;
    const test = setup(true, async () => {
      if (++attempts === 1) throw new TypeError("Failed to fetch");
      return Response.json([{ result: { data: superjson.serialize({ userData: {} }) } }]);
    });
    await invalidateUserQuery("timer:energy_queue", () => test.client.invalidateQueries({ queryKey: key }));
    expect(test.requests).toEqual(["timer:energy_queue", "timer:energy_queue"]);
  });

  it("attributes a cached read replaced while both requests are paused offline", async () => {
    const test = setup();
    onlineManager.setOnline(false);
    await invalidateUserQuery("timer:energy_queue", test.invalidate);
    await invalidateUserQuery("mutation:item.consume", test.invalidate);
    onlineManager.setOnline(true);
    await waitFor(() => expect(test.requests).toEqual(["mutation:item.consume"]));
  });

  it("attributes a replacement read independently of the read it cancels", async () => {
    const releases: (() => void)[] = [];
    const test = setup(true, async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return Response.json([{ result: { data: superjson.serialize({ userData: {} }) } }]);
    });
    const first = invalidateUserQuery("timer:energy_queue", () => test.client.invalidateQueries({ queryKey: key }));
    await waitFor(() => expect(test.requests).toHaveLength(1));
    const second = invalidateUserQuery("mutation:item.consume", () => test.client.invalidateQueries({ queryKey: key }));
    await waitFor(() => expect(test.requests).toHaveLength(2));
    for (const release of releases) release();
    await Promise.all([first, second]);
    expect(test.requests).toEqual(["timer:energy_queue", "mutation:item.consume"]);
  });

  it("restores nested scopes and clears a throwing scope", async () => {
    const test = setup();
    expect(() => withUserRefreshCause("timer:energy_queue", () => { throw new Error("test"); })).toThrow("test");
    await withUserRefreshCause("realtime:battle_ended", () => {
      withUserRefreshCause("timer:energy_queue", () => {});
      return test.client.invalidateQueries({ queryKey: key });
    });
    await test.client.refetchQueries({ queryKey: key });
    expect(test.requests).toEqual(["realtime:battle_ended", "automatic:refresh"]);
  });
});

describe("bounded batch attribution", () => {
  const op = (cause: unknown) => ({ path: "profile.getUser", context: { userRefreshCause: cause } });

  it("omits the header from unrelated operations", () => {
    expect(userRefreshHeaders([{ path: "profile.updatePreferences", context: {} }])).toEqual({});
  });

  it("preserves a single cause and marks conflicting batch causes explicitly", () => {
    expect(userRefreshHeaders([op("timer:energy_queue"), op("timer:energy_queue")])).toEqual({
      [USER_REFRESH_CAUSE_HEADER]: "timer:energy_queue",
    });
    expect(userRefreshHeaders([op("timer:energy_queue"), op("mutation:item.consume")])).toEqual({
      [USER_REFRESH_CAUSE_HEADER]: "unknown:mixed_batch",
    });
  });

  it.each([undefined, null, {}, "mutation:player-id-123", "timer:energy_queue\nsecret"])("rejects non-allowlisted header values: %p", (cause) => {
    expect(parseUserRefreshCause(cause)).toBe("unknown:request");
    expect(userRefreshHeaders([op(cause)])).toEqual({ [USER_REFRESH_CAUSE_HEADER]: "unknown:request" });
  });
});
