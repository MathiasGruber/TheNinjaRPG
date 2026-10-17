import { describe, expect, it, mock } from "bun:test";
import type { Clerk } from "@clerk/shared/types";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/api/root";
import {
  createTrpcSessionHeaders,
  SESSION_CHANGED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from "@/libs/trpcSession";

const session = (id: string, getToken = async (): Promise<string | null> => id) =>
  ({ id, getToken }) as NonNullable<Clerk["session"]>;

describe("tRPC session authentication", () => {
  it("reads the live session after hydration and refreshes its token for every batch", async () => {
    const clerk: Pick<Clerk, "session"> = { session: undefined };
    const headers = createTrpcSessionHeaders(clerk);
    expect(await headers()).toEqual({});
    const getToken = mock(async () => "token_a");
    clerk.session = session("a", getToken);
    expect(await headers()).toEqual({ Authorization: "Bearer token_a" });
    getToken.mockResolvedValue("refreshed_a");
    expect(await headers()).toEqual({ Authorization: "Bearer refreshed_a" });
  });

  it("authenticates batched queries and mutations with the tab's session", async () => {
    const requests: { url: string; authorization: string | null }[] = [];
    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({
        url: "http://localhost/api/trpc",
        transformer: superjson,
        headers: createTrpcSessionHeaders({ session: session("token_a") }),
        fetch: async (url, init) => {
          requests.push({ url: String(url), authorization: new Headers(init?.headers).get("Authorization") });
          return Response.json([{ result: { data: superjson.serialize({ success: true }) } }]);
        },
      })],
    });
    await Promise.all([
      client.profile.getUser.query(),
      client.profile.updatePreferences.mutate({ musicOn: false }),
    ]);
    expect(requests).toHaveLength(2);
    expect(requests.every(({ authorization }) => authorization === "Bearer token_a")).toBe(true);
    expect(requests.some(({ url }) => url.includes("profile.getUser"))).toBe(true);
    expect(requests.some(({ url }) => url.includes("profile.updatePreferences"))).toBe(true);
  });

  it("keeps signed-out public requests available", async () => {
    expect(await createTrpcSessionHeaders({ session: null })()).toEqual({});
  });

  it.each(["switch", "sign-out"])("rejects an old client's queued request after %s", async (change) => {
    const clerk: Pick<Clerk, "session"> = { session: session("a") };
    const headers = createTrpcSessionHeaders(clerk);
    await headers();
    clerk.session = change === "switch" ? session("b") : null;
    await expect(headers()).rejects.toThrow(SESSION_CHANGED_MESSAGE);
    expect(await createTrpcSessionHeaders(clerk)()).toEqual(
      change === "switch" ? { Authorization: "Bearer b" } : {},
    );
  });

  it("rejects a switch before a new client's first batch is sent", async () => {
    const clerk: Pick<Clerk, "session"> = { session: session("a") };
    const headers = createTrpcSessionHeaders(clerk);
    clerk.session = session("b");
    await expect(headers()).rejects.toThrow(SESSION_CHANGED_MESSAGE);
  });

  it.each(["switch", "sign-out"])("rejects a %s while obtaining a token", async (change) => {
    let resolveToken!: (value: string) => void;
    const clerk: Pick<Clerk, "session"> = {
      session: session("a", () => new Promise((resolve) => { resolveToken = resolve; })),
    };
    const pending = createTrpcSessionHeaders(clerk)();
    clerk.session = change === "switch" ? session("b") : null;
    resolveToken("token_a");
    await expect(pending).rejects.toThrow(SESSION_CHANGED_MESSAGE);
  });

  it("never falls back to another tab's cookie when token acquisition fails", async () => {
    await expect(createTrpcSessionHeaders({ session: session("a", async () => null) })())
      .rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    await expect(createTrpcSessionHeaders({ session: session("a", async () => { throw new Error("Offline"); }) })())
      .rejects.toThrow("Offline");
  });
});
