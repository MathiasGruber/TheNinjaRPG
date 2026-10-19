import { getPlatform, invokeSafe } from "./bridge";

/**
 * Keep fixed controls below the Android status bar. The legacy StatusBar plugin
 * defaults to overlaying the WebView on Android <15; SystemBars' viewport-fit=contain
 * padding only applies on newer Android. This uses the plugin already in the shell.
 */
export const fitContent = async (): Promise<void> => {
  if (getPlatform() !== "android") return;
  await invokeSafe("StatusBar", "setOverlaysWebView", { overlay: false });
};
