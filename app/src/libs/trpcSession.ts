import type { Clerk } from "@clerk/shared/types";

export const SESSION_CHANGED_MESSAGE = "Your active account changed. Please try again.";
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";

/** Read the live session, since the client is created before Clerk finishes loading. */
export const createTrpcSessionHeaders = (clerk: Pick<Clerk, "session">) => {
  // ActiveSessionBoundary replaces this client on account switches. Keep requests still
  // queued on the old client from being authenticated as the newly selected account.
  // Only bind immediately when Clerk has loaded; the hydrated client must learn its
  // first account later. Tokens and sign-in availability are always read live below.
  const initialSession = clerk.session;
  let clientSessionId =
    initialSession === undefined ? undefined : (initialSession?.id ?? null);
  return async (): Promise<Record<string, string>> => {
    const session = clerk.session;
    if (session === undefined) return {};
    const sessionId = session?.id ?? null;
    if (clientSessionId === undefined) clientSessionId = sessionId;
    if (clientSessionId !== sessionId) throw new Error(SESSION_CHANGED_MESSAGE);
    if (!session) return {};

    const token = await session.getToken();
    if (clerk.session?.id !== session.id) throw new Error(SESSION_CHANGED_MESSAGE);
    // Falling back to cookies here could authenticate the request as another tab's user.
    if (!token) throw new Error(SESSION_EXPIRED_MESSAGE);
    return { Authorization: `Bearer ${token}` };
  };
};
