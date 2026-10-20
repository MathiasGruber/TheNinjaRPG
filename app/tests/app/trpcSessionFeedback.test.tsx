import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as clerk from "@clerk/nextjs";
import type { Clerk } from "@clerk/shared/types";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import type { TRPCClient } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { type ToastT, toast as sonnerToast } from "sonner";
import superjson from "superjson";
import type { AppRouter } from "@/api/root";
import * as clientModule from "@/app/_trpc/client";
import TrpcClientProvider from "@/app/_trpc/Provider";
import { toast as uiToast } from "@/components/ui/use-toast";
import * as toast from "@/libs/toast";
import * as sessionModule from "@/libs/trpcSession";
import { actualShowMutationToast } from "../setup/preload";

const testApi = createTRPCReact<AppRouter>();
let queryClient: QueryClient;
const session = (id: string, getToken = async (): Promise<string | null> => id) =>
  ({ id, getToken }) as NonNullable<Clerk["session"]>;
const notices = () => sonnerToast.getToasts().filter((notice): notice is ToastT => "title" in notice);
const messages = () => notices().map((notice) => notice.description ?? notice.title);

const callbacks = [
  { file: "support/[ticketId]", path: "support.updateTicket" },
  { file: "manual/polls", path: "poll.updatePoll" },
  { file: "points", path: "paypal.resolveSubscription", subscription: true },
  { file: "points", path: "paypal.upgradeSubscription", subscription: true },
  { file: "points", path: "paypal.subscribeWithReps", subscription: true },
] as const;

// Run the pages' actual callback expressions, including the unexported poll form.
// Taking them from source makes a bypass in any one callback fail the integration.
const pageOnError = (source: (typeof callbacks)[number], onFailure: () => void) => {
  const file = join(import.meta.dirname, "../../src/app/[shell]", source.file, "page.tsx");
  const expression = readFileSync(file, "utf8")
    .split(`api.${source.path}.useMutation`)[1]
    ?.match(/onError:\s*(\(error\) => \{[\s\S]*?\n\s*\}),/)?.[1];
  if (!expression) throw new Error(`${source.path} onError callback was not found`);
  return new Function(
    "toast", "onError", "props", "getSessionErrorToastId", "showMutationToast", `return (${expression});`,
  )(
    uiToast,
    clientModule.onError,
    { onFailure },
    Reflect.get(sessionModule, "getSessionErrorToastId"),
    toast.showMutationToast,
  ) as (error: { message: string }) => void;
};

const mountCallback = (
  source: (typeof callbacks)[number],
  activeSession = session("a"),
) => {
  const auth = { session: activeSession, isSignedIn: true, addListener: () => () => {} };
  vi.spyOn(clerk, "useClerk").mockReturnValue(
    auth as unknown as ReturnType<typeof clerk.useClerk>,
  );
  Object.assign(vi.spyOn(clientModule, "api" as never), {
    Provider: testApi.Provider,
    createClient: testApi.createClient,
  });
  const onSuccess = vi.fn();
  const onFailure = vi.fn();
  const onError = vi.fn(pageOnError(source, onFailure));
  let trpc!: TRPCClient<AppRouter>;
  let mutate!: () => Promise<unknown>;
  const Probe = () => {
    queryClient = useQueryClient();
    trpc = testApi.useUtils().client;
    // All five callbacks use the same React Query mutation lifecycle. The transport
    // is mocked; no billing, staff writes or account provisioning can occur here.
    const mutation = testApi.support.updateTicket.useMutation({ onSuccess, onError });
    mutate = () => mutation.mutateAsync({ ticketId: "ticket-a", status: "IN_PROGRESS" });
    return null;
  };
  const view = render(
    <TrpcClientProvider cdnCachedQueryPaths={[]}><Probe /></TrpcClientProvider>,
  );
  return { auth, trpc, mutate, onSuccess, onError, onFailure, unmount: view.unmount };
};

beforeEach(() => {
  sonnerToast.dismiss();
  vi.spyOn(toast, "showMutationToast").mockImplementation(actualShowMutationToast);
});

afterEach(() => {
  cleanup();
  queryClient?.clear();
  sonnerToast.dismiss();
  vi.restoreAllMocks();
});

for (const source of callbacks) {
  for (const message of [sessionModule.SESSION_CHANGED_MESSAGE, sessionModule.SESSION_EXPIRED_MESSAGE]) {
    it.each([true, false])(
      `${source.path} renders ${message} once when shared feedback arrives first=%s`,
      (sharedFirst) => {
        const shared = () => toast.showMutationToast({ success: false, message });
        const local = () => pageOnError(source, vi.fn())(new Error(message));
        for (const notify of sharedFirst ? [shared, local] : [local, shared]) notify();
        expect(notices()).toHaveLength(1);
        expect([notices()[0]?.title, notices()[0]?.description].filter((value) => value === message)).toHaveLength(1);
        // The app's toaster hides titles on mobile; the recovery message must stay visible.
        expect(notices()[0]?.description).toBe(message);
      },
    );
  }

  it(`${source.path} coalesces its old callback after unmount with a late query failure`, async () => {
    const releases: Array<() => void> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return Response.json([{ result: { data: superjson.serialize({ success: true }) } }]);
    });
    const { auth, trpc, mutate, onSuccess, onError, onFailure, unmount } = mountCallback(source);
    let settled!: Promise<PromiseSettledResult<unknown>[]>;
    act(() => {
      settled = Promise.allSettled([
        queryClient.fetchQuery({ queryKey: ["late"], queryFn: () => trpc.profile.getDashboard.query(), retry: false }),
        mutate(),
      ]);
    });
    await waitFor(() => expect(releases).toHaveLength(2));
    expect(queryClient.isMutating()).toBe(1);
    auth.session = session("b");
    unmount();
    for (const release of releases) release();
    const results = await settled;
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason.message).toBe(sessionModule.SESSION_CHANGED_MESSAGE);
    }
    expect(queryClient.isFetching()).toBe(0);
    expect(queryClient.isMutating()).toBe(0);
    expect(queryClient.getMutationCache().getAll()[0]?.state.status).toBe("error");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes("subscription" in source ? 1 : 0);
    expect(messages()).toEqual([sessionModule.SESSION_CHANGED_MESSAGE]);
  });

  it(`${source.path} coalesces its expired-session callback with a query failure`, async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { trpc, mutate, onSuccess, onError, onFailure } = mountCallback(source, session("a", async () => null));
    let results!: PromiseSettledResult<unknown>[];
    await act(async () => {
      results = await Promise.allSettled([
        queryClient.fetchQuery({ queryKey: ["expired"], queryFn: () => trpc.profile.getDashboard.query(), retry: false }),
        mutate(),
      ]);
    });
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(fetch).not.toHaveBeenCalled();
    expect(queryClient.isFetching()).toBe(0);
    expect(queryClient.isMutating()).toBe(0);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes("subscription" in source ? 1 : 0);
    expect(messages()).toEqual([sessionModule.SESSION_EXPIRED_MESSAGE]);
  });

  it(`${source.path} keeps equal ordinary failures separate with their existing presentation`, async () => {
    const message = "This action is unavailable.";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json([{
      error: superjson.serialize({ message, code: -32600, data: { code: "BAD_REQUEST" } }),
    }]));
    const { mutate, onError, onSuccess, onFailure } = mountCallback(source);
    for (let i = 0; i < 2; i++) {
      await act(async () => { await expect(mutate()).rejects.toThrow(message); });
    }
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes("subscription" in source ? 2 : 0);
    expect(queryClient.isMutating()).toBe(0);
    expect(messages()).toEqual([message, message]);
    expect(notices().map((notice) => notice.title)).toEqual(
      Array(2).fill("subscription" in source ? "BAD_REQUEST" : "Error"),
    );
    expect(notices().every((notice) => notice.type === "error")).toBe(true);
  });

  it(`${source.path} leaves successful same-session mutations successful`, async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json([{ result: { data: superjson.serialize({ success: true }) } }]),
    );
    const { mutate, onSuccess, onError, onFailure } = mountCallback(source);
    await act(async () => { await expect(mutate()).resolves.toEqual({ success: true }); });
    expect(queryClient.isMutating()).toBe(0);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });
}

it("preserves generic subscription error feedback and ignores unsupported thrown values", () => {
  for (const error of [null, undefined, "failed", { message: "failed" }]) clientModule.onError(error);
  expect(notices()).toEqual([]);
  for (let i = 0; i < 2; i++) clientModule.onError(new Error("Ordinary failure"));
  expect(messages()).toEqual(["Ordinary failure", "Ordinary failure"]);
  expect(notices().every((notice) => notice.title === "Error" && notice.type === "error")).toBe(true);
});

it.each([sessionModule.SESSION_CHANGED_MESSAGE, sessionModule.SESSION_EXPIRED_MESSAGE])(
  "coalesces generic subscription Errors for %s with shared feedback",
  (message) => {
    clientModule.onError(new Error(message));
    toast.showMutationToast({ success: false, message });
    expect(messages()).toEqual([message]);
  },
);

it("preserves the support callback's empty-message fallback", () => {
  pageOnError(callbacks[0], vi.fn())(new Error(""));
  expect(messages()).toEqual(["Could not update the ticket. Please try again."]);
  expect(notices()[0]?.type).toBe("error");
});
