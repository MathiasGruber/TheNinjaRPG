import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { fitContent } from "@/libs/native/viewport";
import { ensureDom } from "../setup-dom.mjs";

type NativeWindow = Window & { Capacitor?: unknown };
let previous: unknown;
beforeEach(() => {
  ensureDom();
  previous = (window as NativeWindow).Capacitor;
});
afterEach(() => { (window as NativeWindow).Capacitor = previous; });

describe("Android native viewport", () => {
  it("uses the installed status-bar plugin to stop overlaying tappable content", async () => {
    const setOverlaysWebView = vi.fn().mockResolvedValue(undefined);
    (window as NativeWindow).Capacitor = {
      isNativePlatform: () => true, getPlatform: () => "android",
      Plugins: { StatusBar: { setOverlaysWebView } },
    };
    await fitContent();
    expect(setOverlaysWebView).toHaveBeenCalledWith({ overlay: false });
  });
  it.each(["ios", "web"])("does not alter %s system bars", async (platform) => {
    const setOverlaysWebView = vi.fn();
    (window as NativeWindow).Capacitor = {
      isNativePlatform: () => true, getPlatform: () => platform,
      Plugins: { StatusBar: { setOverlaysWebView } },
    };
    await fitContent();
    expect(setOverlaysWebView).not.toHaveBeenCalled();
  });
  it("keeps the page usable without a bridge or with an unavailable plugin", async () => {
    (window as NativeWindow).Capacitor = undefined;
    await expect(fitContent()).resolves.toBeUndefined();
    (window as NativeWindow).Capacitor = {
      isNativePlatform: () => true, getPlatform: () => "android", Plugins: {},
    };
    await expect(fitContent()).resolves.toBeUndefined();
    (window as NativeWindow).Capacitor = {
      isNativePlatform: () => true, getPlatform: () => "android",
      Plugins: { StatusBar: { setOverlaysWebView: async () => { throw new Error("unavailable"); } } },
    };
    await expect(fitContent()).resolves.toBeUndefined();
  });
});
