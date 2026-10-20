import type { Clerk } from "@clerk/shared/types";
import type { TRPCLink } from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/api/root";

export const SESSION_CHANGED_MESSAGE = "Your active account changed. Please try again.";
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";
export const TRPC_ANONYMOUS_HEADER = "x-tnr-anonymous";

/** Keep the hydrated client, but permanently retire it when its account changes. */
export const createTrpcSession = (clerk: Pick<Clerk, "session">) => {
  const initialSession = clerk.session;
  let clientSessionId =
    initialSession === undefined ? undefined : (initialSession?.id ?? null);
  let retired = false;
  let ready: Promise<void> | undefined;
  let resolveReady: (() => void) | undefined;
  const observeSession = (sessionId: string | null | undefined) => {
    if (sessionId === undefined) return;
    if (clientSessionId === undefined) clientSessionId = sessionId;
    if (clientSessionId !== sessionId) retired = true;
    resolveReady?.();
  };
  const assertCurrent = () => {
    const session = clerk.session;
    observeSession(session === undefined ? undefined : (session?.id ?? null));
    if (retired) throw new Error(SESSION_CHANGED_MESSAGE);
  };
  const headers = async (): Promise<Record<string, string>> => {
    assertCurrent();
    // Public queries can depend on the viewer too. Do not cache an anonymous result
    // while Clerk is still discovering the account that hydrated this tree.
    if (clerk.session === undefined) {
      ready ??= new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      await ready;
      assertCurrent();
    }
    const session = clerk.session;
    if (session === undefined) throw new Error(SESSION_EXPIRED_MESSAGE);
    if (!session) return { [TRPC_ANONYMOUS_HEADER]: "1" };
    const token = await session.getToken();
    assertCurrent();
    if (clerk.session?.id !== session.id) throw new Error(SESSION_CHANGED_MESSAGE);
    // Falling back to cookies here could authenticate the request as another tab's user.
    if (!token) throw new Error(SESSION_EXPIRED_MESSAGE);
    return { Authorization: `Bearer ${token}` };
  };
  return { headers, assertCurrent, observeSession };
};

/** Discard late responses before mutation callbacks can update status or show success. */
export const trpcSessionLink =
  (
    session: Pick<ReturnType<typeof createTrpcSession>, "assertCurrent">,
  ): TRPCLink<AppRouter> =>
  () =>
  ({ op, next }) =>
    observable((observer) => {
      try {
        session.assertCurrent();
      } catch (error) {
        observer.error(TRPCClientError.from(error as Error));
        return;
      }
      return next(op).subscribe({
        next(value) {
          try {
            session.assertCurrent();
            observer.next(value);
          } catch (error) {
            observer.error(TRPCClientError.from(error as Error));
          }
        },
        error(error) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        },
      });
    });

/** Preserve experiment cookies without borrowing another tab's authentication. */
export const trpcSessionUserId = (
  authenticatedUserId: string | null,
  headers: Pick<Headers, "get">,
) => (headers.get(TRPC_ANONYMOUS_HEADER) === "1" ? null : authenticatedUserId);
