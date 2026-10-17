import * as clerk from "@clerk/nextjs";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { type NativeAuthResult, useNativeAuth } from "@/hooks/useNativeAuth";
import * as native from "@/libs/native";
import { appEvents, oauthBrowser } from "@/libs/native";
import { ensureDom } from "../setup-dom.mjs";

ensureDom();

const incomplete = () => ({
  createdSessionId: null,
  firstFactorVerification: { status: "unverified", error: null },
});
const completed = () => ({
  ...incomplete(),
  createdSessionId: "session-native",
});

let onUrl: (url: string) => void;
let onFinished: () => void;
const mocks = {
  create: vi.fn(),
  reload: vi.fn(),
  createSignUp: vi.fn(),
  setActive: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  stopUrl: vi.fn(),
  stopFinished: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReset().mockResolvedValue({
    ...incomplete(),
    firstFactorVerification: {
      status: "unverified",
      externalVerificationRedirectURL: new URL("https://accounts.example/authorize"),
    },
  });
  mocks.reload.mockReset().mockResolvedValue(completed());
  mocks.createSignUp.mockReset().mockResolvedValue({
    createdSessionId: "session-signup",
  });
  mocks.setActive.mockReset().mockResolvedValue(undefined);
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.open.mockReset().mockImplementation(async () => {
    onUrl("tnr://oauth-callback?rotating_token_nonce=nonce%2Bvalue");
  });
  vi.spyOn(native, "isNative").mockReturnValue(true);
  vi.spyOn(clerk, "useClerk").mockReturnValue({
    client: {
      signIn: { create: mocks.create, reload: mocks.reload },
      signUp: { create: mocks.createSignUp },
    },
    setActive: mocks.setActive,
  } as unknown as ReturnType<typeof clerk.useClerk>);
  vi.spyOn(appEvents, "onUrlOpen").mockImplementation((callback) => {
    onUrl = callback;
    return mocks.stopUrl;
  });
  vi.spyOn(oauthBrowser, "onFinished").mockImplementation((callback) => {
    onFinished = callback;
    return mocks.stopFinished;
  });
  vi.spyOn(oauthBrowser, "open").mockImplementation(mocks.open);
  vi.spyOn(oauthBrowser, "close").mockImplementation(mocks.close);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const signIn = async () => {
  const { result } = renderHook(() => useNativeAuth());
  let outcome: NativeAuthResult | undefined;
  await act(async () => {
    outcome = await result.current.signInWithProvider("google");
  });
  expect(result.current.isPending).toBe(false);
  expect(mocks.setActive.mock.calls.length).toBeLessThanOrEqual(1);
  expect(mocks.stopUrl).toHaveBeenCalledTimes(1);
  expect(mocks.stopFinished).toHaveBeenCalledTimes(1);
  return outcome;
};

describe("native OAuth callback settlement", () => {
  it("passes the callback nonce to Clerk before activating the returned session", async () => {
    expect(await signIn()).toEqual({ status: "complete" });
    expect(mocks.reload).toHaveBeenCalledWith({
      rotatingTokenNonce: "nonce+value",
    });
    expect(mocks.setActive).toHaveBeenCalledWith({
      session: "session-native",
    });
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("uses a nonce arriving after dismissal has started the first reload", async () => {
    mocks.open.mockImplementation(async () => onFinished());
    mocks.reload.mockImplementationOnce(async () => {
      onUrl("tnr://oauth-callback?rotating_token_nonce=racing-nonce");
      return incomplete();
    });
    expect(await signIn()).toEqual({ status: "complete" });
    expect(mocks.reload.mock.calls).toEqual([
      [undefined],
      [{ rotatingTokenNonce: "racing-nonce" }],
    ]);
    expect(mocks.setActive).toHaveBeenCalledTimes(1);
  });

  it("waits for a callback arriving after an incomplete dismissal reload", async () => {
    mocks.open.mockImplementation(async () => {
      onFinished();
      setTimeout(() => {
        onUrl("tnr://oauth-callback?rotating_token_nonce=late-nonce");
      }, 20);
    });
    mocks.reload.mockResolvedValueOnce(incomplete());
    expect(await signIn()).toEqual({ status: "complete" });
    expect(mocks.reload.mock.calls).toEqual([
      [undefined],
      [{ rotatingTokenNonce: "late-nonce" }],
    ]);
    expect(mocks.setActive).toHaveBeenCalledTimes(1);
  });

  it("retains cancellation and permits a later attempt", async () => {
    mocks.open.mockImplementationOnce(async () => onFinished());
    mocks.reload.mockResolvedValueOnce(incomplete());
    expect(await signIn()).toEqual({ status: "cancelled" });
    expect(mocks.setActive).not.toHaveBeenCalled();
    mocks.stopUrl.mockClear();
    mocks.stopFinished.mockClear();
    expect(await signIn()).toEqual({ status: "complete" });
  });

  it("supports callbacks without a rotating nonce", async () => {
    mocks.open.mockImplementation(async () => onUrl("tnr://oauth-callback"));
    expect(await signIn()).toEqual({ status: "complete" });
    expect(mocks.reload).toHaveBeenCalledWith(undefined);
  });

  it.each([
    "tnr://oauth-callback.evil.example?rotating_token_nonce=untrusted",
    "tnr://oauth-callback/other?rotating_token_nonce=untrusted",
    "https://oauth-callback?rotating_token_nonce=untrusted",
    "tnr://owner@oauth-callback?rotating_token_nonce=untrusted",
    "tnr://oauth-callback:123?rotating_token_nonce=untrusted",
    "not a URL",
  ])("ignores unrelated OS links: %s", async (url) => {
    mocks.open.mockImplementation(async () => {
      onUrl(url);
      onFinished();
    });
    mocks.reload.mockResolvedValue(incomplete());
    expect(await signIn()).toEqual({ status: "cancelled" });
    expect(mocks.reload).toHaveBeenCalledWith(undefined);
    expect(mocks.setActive).not.toHaveBeenCalled();
  });

  it("transfers a verified new identity after its nonce reload", async () => {
    mocks.reload.mockResolvedValue({
      ...incomplete(),
      firstFactorVerification: { status: "transferable" },
    });
    expect(await signIn()).toEqual({ status: "complete" });
    expect(mocks.createSignUp).toHaveBeenCalledWith({ transfer: true });
    expect(mocks.setActive).toHaveBeenCalledWith({
      session: "session-signup",
    });
  });

  it("shows Clerk's failed verification instead of reporting a cancellation", async () => {
    mocks.open.mockImplementation(async () => onFinished());
    mocks.reload.mockImplementation(async () => {
      onUrl("tnr://oauth-callback?__clerk_status=failed");
      return {
        ...incomplete(),
        firstFactorVerification: {
          status: "failed",
          error: { message: "Authorization failed", longMessage: "Please retry sign-in" },
        },
      };
    });
    expect(await signIn()).toEqual({ status: "error", message: "Please retry sign-in" });
    expect(mocks.setActive).not.toHaveBeenCalled();
  });

  it("settles a reload failure and releases the native listeners", async () => {
    mocks.reload.mockRejectedValue(new Error("Connection interrupted"));
    expect(await signIn()).toEqual({
      status: "error",
      message: "Connection interrupted",
    });
    expect(mocks.setActive).not.toHaveBeenCalled();
  });
});
