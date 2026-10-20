"use client";

import { useClerk } from "@clerk/nextjs";
import * as Sentry from "@sentry/nextjs";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  httpBatchLink,
  loggerLink,
  retryLink,
  splitLink,
  TRPCClientError,
} from "@trpc/client";
import { useEffect, useState } from "react";
import superjson from "superjson";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/components/ui/use-toast";
import { BOTID_BLOCKED_MESSAGE, BOTID_RELOAD_REQUIRED_MESSAGE } from "@/libs/botid";
import { BUILD_ID_HEADER, noteServerBuild } from "@/libs/buildVersion";
import { showMutationToast } from "@/libs/toast";
import { shouldLogTrpcOperation } from "@/libs/trpcLogging";
import {
  createTrpcSession,
  SESSION_CHANGED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  trpcSessionLink,
} from "@/libs/trpcSession";
import { isRetryableTrpcError } from "@/utils/error";
import {
  api,
  SIGN_IN_REQUIRED_MUTATION_MESSAGE,
  useGlobalOnMutateProtect,
} from "./client";

const getBaseUrl = () => {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
};

const TrpcClientProvider = (props: {
  cdnCachedQueryPaths: readonly string[];
  children: React.ReactNode;
}) => {
  const clerk = useClerk();
  const [session] = useState(() => createTrpcSession(clerk));
  useEffect(() => {
    const unsubscribe = clerk.addListener(({ session: active }) =>
      session.observeSession(active === undefined ? undefined : (active?.id ?? null)),
    );
    return () => {
      // The boundary can unmount this provider before its Clerk listener runs.
      const active = clerk.session;
      session.observeSession(active === undefined ? undefined : (active?.id ?? null));
      unsubscribe();
    };
  }, [clerk, session]);
  const onMutateCheck = useGlobalOnMutateProtect();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
          },
          mutations: {
            onError: (error) => handleTrpcError(error),
          },
        },
        queryCache: new QueryCache({
          onError: (error, _query) => handleTrpcError(error),
        }),
        mutationCache: new MutationCache({
          onMutate: (_variables, mutation) => {
            session.assertCurrent();
            // Extract tRPC mutation path from mutation key (e.g., [["towerDefense", "initiateGuestSession"]])
            const key = mutation.options.mutationKey;
            const mutationPath =
              Array.isArray(key) && Array.isArray(key[0])
                ? key[0].join(".")
                : undefined;
            onMutateCheck(mutationPath);
          },
        }),
      }),
  );
  const [trpcClient] = useState(() => {
    const cdnCachedQueries = new Set(props.cdnCachedQueryPaths);
    return api.createClient({
      links: [
        trpcSessionLink(session),
        retryLink({
          retry(options) {
            if (
              options.error.message === SESSION_CHANGED_MESSAGE ||
              options.error.message === SESSION_EXPIRED_MESSAGE
            ) {
              return false;
            }
            // Retry transient network/CDN errors (network failures, offline, invalid JSON responses)
            if (isRetryableTrpcError(options.error) && options.op.type === "query") {
              return options.attempts <= 3;
            }
            // Don't retry on non-500s
            if (
              options.error.data &&
              (options.error.data as { code?: string }).code !== "INTERNAL_SERVER_ERROR"
            ) {
              return false;
            }
            // Only retry queries
            if (options.op.type !== "query") {
              return false;
            }
            // Retry up to 3 times
            return options.attempts <= 3;
          },
          // Double every attempt, with max of 30 seconds (starting at 1 second)
          retryDelayMs: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        }),
        loggerLink({
          enabled: shouldLogTrpcOperation,
        }),
        // CDN-cached queries get their own batch, so their URL is the same for every
        // visitor.
        splitLink({
          condition: (op) => op.type === "query" && cdnCachedQueries.has(op.path),
          true: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc/cdn`,
            transformer: superjson,
          }),
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            // Cookies are shared by tabs; the token belongs to this tab's active session.
            headers: session.headers,
            // Only uncached responses name the current deploy; a CDN copy can predate it.
            fetch: async (input, init) => {
              const response = await fetch(input, init);
              noteServerBuild(response.headers.get(BUILD_ID_HEADER));
              return response;
            },
          }),
        }),
      ],
    });
  });
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
    </api.Provider>
  );
};

export default TrpcClientProvider;

const handleTrpcError = (error: unknown) => {
  const trpcErrorCode =
    error instanceof TRPCClientError
      ? (error.data as { code?: string } | undefined)?.code
      : undefined;

  // A switch rejects queued requests and discards late responses. Pending state settles,
  // and the rebuilt account tree permits retrying without applying the old response.
  if (
    error instanceof Error &&
    (error.message === SESSION_CHANGED_MESSAGE ||
      error.message === SESSION_EXPIRED_MESSAGE)
  ) {
    showMutationToast({ success: false, message: error.message, id: error.message });
    return;
  }

  // Ignore "Unauthorized for tRPC endpoint", since this could be just the user logging out, thus queries failing
  // This error is thrown server-side by auth middleware, so we silently handle it to avoid showing
  // destructive toasts during normal logout flows. Some client/network error shapes do not
  // preserve error.data.code, so only require the code when tRPC actually provided one.
  if (
    error instanceof TRPCClientError &&
    error.message.includes("Unauthorized for tRPC endpoint") &&
    (trpcErrorCode === undefined || trpcErrorCode === "UNAUTHORIZED")
  ) {
    return;
  }

  // Note: HTML error pages (403 auth, 500 server errors) trigger JSON parse errors.
  // - 403 auth errors: Handled by "Unauthorized for tRPC endpoint" check above (lines 118-124)
  // - Network/CDN HTML responses: Handled by isRetryableTrpcError below (retried up to 3x)
  // - 500 server errors: Should NOT be silently suppressed - users need to see these
  // Therefore, we don't filter HTML responses here. Let them fall through to proper handling.

  // Ignore transient network/CDN errors (retries handle these gracefully)
  // Queries are retried by retryLink (up to 3 attempts), mutations are never retried
  // All retryable errors are suppressed here to avoid user-facing toasts for transient issues
  if (error instanceof TRPCClientError) {
    if (isRetryableTrpcError(error)) {
      // Filtered from Sentry in instrumentation-client.ts (isNetworkNavigationError)
      return;
    }
  }
  // Ignore abort errors (user navigated away before request completed)
  // Use spec-compliant cause.name check with message-based fallback for browsers
  // that don't properly set cause.name
  if (error instanceof TRPCClientError) {
    if (error.cause?.name === "AbortError") {
      // AbortError cause is reliable, no validation needed
      return;
    }
    if (error.message.includes("The operation was aborted")) {
      // Message-based fallback: abort errors always have this specific message
      // and originate from fetch/navigation context, so message match is sufficient
      return;
    }
  }
  // Handle "not signed in" errors gracefully (from useGlobalOnMutateProtect)
  // This specific error message is only thrown from useGlobalOnMutateProtect in client.ts,
  // so message matching is sufficient (stack trace checking doesn't work in production builds)
  if (error instanceof Error && error.message === SIGN_IN_REQUIRED_MUTATION_MESSAGE) {
    showMutationToast({ success: false, message: error.message });
    return;
  }
  console.error("onerror", error);
  if (error instanceof TRPCClientError) {
    const errorCode = trpcErrorCode;
    // Handle rate limiting errors with a softer toast (not logged to Sentry, not destructive)
    if (errorCode === "TOO_MANY_REQUESTS") {
      showMutationToast({ success: false, message: error.message });
      return;
    }
    // A BotID rejection of a mutation: a bot verdict, or no challenge because the page
    // is out of date. The server records each one, and the toast offers the reload that
    // loads the current bundle and a fresh challenge. The mutation settles as failed, so
    // its pending state clears like any other rejection.
    if (
      (errorCode === "FORBIDDEN" && error.message === BOTID_BLOCKED_MESSAGE) ||
      (errorCode === "PRECONDITION_FAILED" &&
        error.message === BOTID_RELOAD_REQUIRED_MESSAGE)
    ) {
      showMutationToast({
        success: false,
        message: error.message,
        action: (
          <ToastAction
            altText="Reload the page"
            onClick={() => window.location.reload()}
          >
            Reload
          </ToastAction>
        ),
      });
      return;
    }
    // Expected authorization result. The screen that issued the query is responsible
    // for its empty state; this toast is the feedback, and it is not a defect to report.
    if (errorCode === "UNAUTHORIZED") {
      toast({
        variant: "destructive",
        title: "Unauthorized",
        description: error.message,
      });
      return;
    }
    Sentry.captureException(error, { extra: { message: "TRPC Client Error" } });
    toast({
      variant: "destructive",
      title: error?.data?.code ?? "Unknown",
      description: error.message,
    });
  } else if (error instanceof Error) {
    Sentry.captureException(error, { extra: { message: "TRPC Frontend Error" } });
    toast({
      variant: "destructive",
      title: "Error",
      description: error.message,
    });
  } else if (error !== null && error !== undefined) {
    Sentry.captureMessage("Non-Error object thrown", {
      level: "warning",
      extra: { error },
    });
  }
};
