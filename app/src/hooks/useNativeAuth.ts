"use client";

import { useClerk } from "@clerk/nextjs";
import type { SignInResource } from "@clerk/shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNativeAuthHandoff } from "@/hooks/useNativeAuthHandoff";
import { appEvents, appleAuth, isNative, oauthBrowser } from "@/libs/native";
import { createAuthProof } from "@/libs/native/authProof";
import type { NativeAuthProvider } from "@/validators/nativeAuth";

/** Where the provider sends the player back to. Registered in both native projects. */
const OAUTH_REDIRECT = "tnr://oauth-callback";
const OAUTH_CALLBACK_GRACE_MS = 2000;

export type NativeAuthResult =
  | { status: "complete" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/** Apple uses its native sheet. Other providers finish in one browser cookie store,
 * then return a one-use PKCE handoff to the shell's own Clerk client. */
export const useNativeAuth = () => {
  const clerk = useClerk();
  const [isPending, setIsPending] = useState(false);
  const handoff = useNativeAuthHandoff();
  const alive = useRef(true);
  const busy = useRef(false);
  const cancelPending = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelPending.current?.();
    };
  }, []);

  const isReady = isNative() && Boolean(clerk.client?.signIn);

  /**
   * Clerk keeps sign-in and sign-up separate, so a first-time player's sign-in comes back
   * "transferable" rather than complete. Transferring is what turns the same OAuth result
   * into an account.
   */
  const completeOrTransfer = useCallback(
    async (result: SignInResource): Promise<NativeAuthResult> => {
      if (!alive.current) return { status: "cancelled" };
      if (result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        return { status: "complete" };
      }
      if (result.firstFactorVerification.status === "transferable") {
        const signUp = clerk.client?.signUp;
        if (!signUp) return { status: "error", message: "Sign-up is unavailable" };
        const created = await signUp.create({ transfer: true });
        if (!alive.current) return { status: "cancelled" };
        if (created.createdSessionId) {
          await clerk.setActive({ session: created.createdSessionId });
          return { status: "complete" };
        }
        return {
          status: "error",
          message:
            "This account needs a few more details. Finish signing up on the web.",
        };
      }
      if (result.firstFactorVerification.error) {
        return toResult({ errors: [result.firstFactorVerification.error] });
      }
      return { status: "error", message: "Sign-in did not complete" };
    },
    [clerk],
  );

  const signInWithApple = useCallback(async (): Promise<NativeAuthResult> => {
    const signIn = clerk.client?.signIn;
    if (!isNative() || !signIn) {
      return { status: "error", message: "Authentication is still loading" };
    }
    if (busy.current) return { status: "cancelled" };
    busy.current = true;
    setIsPending(true);
    try {
      const credential = await appleAuth.authorize();
      const result = await signIn.create({
        strategy: "oauth_token_apple",
        token: credential.identityToken,
      });
      return await completeOrTransfer(result);
    } catch (error) {
      return toResult(error);
    } finally {
      busy.current = false;
      setIsPending(false);
    }
  }, [clerk, completeOrTransfer]);

  const signInWithProvider = useCallback(
    async (provider: oauthBrowser.ExternalOAuthProvider): Promise<NativeAuthResult> => {
      const signIn = clerk.client?.signIn;
      if (!isNative() || !signIn) {
        return { status: "error", message: "Authentication is still loading" };
      }
      if (!["google", "discord", "facebook"].includes(provider)) {
        return { status: "error", message: "This provider is unavailable" };
      }
      if (busy.current) return { status: "cancelled" };
      busy.current = true;
      setIsPending(true);
      const initialSessionId = clerk.session?.id ?? null;
      let stopListening: () => void = () => undefined;
      let browserOpened = false;
      try {
        const proof = await createAuthProof();
        const { flowId } = await handoff.start({
          provider: provider as NativeAuthProvider,
          challenge: proof.challenge,
        });
        if (!alive.current) return { status: "cancelled" };
        const target = new URL("/native-sign-in", window.location.origin);
        target.searchParams.set("flow", flowId);
        let callback: URL | undefined;
        let notifyCallback: () => void = () => undefined;
        const callbackReceived = new Promise<void>((resolve) => {
          notifyCallback = resolve;
        });
        const outcome = await new Promise<"redirected" | "dismissed">((resolve) => {
          cancelPending.current = () => resolve("dismissed");
          const stopUrl = appEvents.onUrlOpen((url) => {
            const parsed = parseOAuthCallback(url);
            if (
              !parsed ||
              parsed.searchParams.get("flow") !== flowId ||
              !/^[A-Za-z0-9_-]{43}$/.test(parsed.searchParams.get("code") ?? "")
            )
              return;
            callback = parsed;
            notifyCallback();
            resolve("redirected");
          });
          const stopFinished = oauthBrowser.onFinished(() => resolve("dismissed"));
          stopListening = () => {
            stopUrl();
            stopFinished();
          };
          browserOpened = true;
          void oauthBrowser.open(target.toString()).catch(() => resolve("dismissed"));
        });
        if (!alive.current) return { status: "cancelled" };
        if (outcome === "dismissed" && !callback) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            callbackReceived,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, OAUTH_CALLBACK_GRACE_MS);
            }),
          ]);
          clearTimeout(timer);
        }
        if (!callback || !alive.current) return { status: "cancelled" };
        const { ticket } = await handoff.exchange({
          flowId,
          verifier: proof.verifier,
          code: callback.searchParams.get("code") ?? "",
        });
        if (!alive.current || (clerk.session?.id ?? null) !== initialSessionId) {
          return { status: "cancelled" };
        }
        // This ticket is consumed by the WebView's client, so existing SSR/session
        // cookies, logout and device isolation retain their normal behavior.
        const created = await signIn.create({ strategy: "ticket", ticket });
        const currentSessionId = clerk.session?.id ?? null;
        if (
          !alive.current ||
          (currentSessionId !== initialSessionId &&
            currentSessionId !== created.createdSessionId)
        ) {
          return { status: "cancelled" };
        }
        return await completeOrTransfer(created);
      } catch (error) {
        return toResult(error);
      } finally {
        stopListening();
        if (browserOpened) await oauthBrowser.close();
        cancelPending.current = undefined;
        busy.current = false;
        setIsPending(false);
      }
    },
    [clerk, completeOrTransfer, handoff.exchange, handoff.start],
  );

  return { isReady, isPending, signInWithApple, signInWithProvider };
};

/** Only this registered callback belongs to an outstanding native sign-in. */
const parseOAuthCallback = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    const expected = new URL(OAUTH_REDIRECT);
    return parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname &&
      (parsed.pathname === "" || parsed.pathname === "/") &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
      ? parsed
      : null;
  } catch {
    return null;
  }
};

/**
 * A dismissed sheet is not a failure worth showing an error for; the native plugin marks
 * it, and Clerk's own errors carry a usable message.
 */
const toResult = (error: unknown): NativeAuthResult => {
  if (error instanceof Error && error.message === "cancelled") {
    return { status: "cancelled" };
  }
  const clerkError = (
    error as { errors?: { longMessage?: string; message?: string }[] } | null
  )?.errors?.[0];
  if (clerkError) {
    return {
      status: "error",
      message: clerkError.longMessage ?? clerkError.message ?? "Sign-in failed",
    };
  }
  return {
    status: "error",
    message: error instanceof Error ? error.message : "Sign-in failed",
  };
};
