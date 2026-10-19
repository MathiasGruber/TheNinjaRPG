import { getPlatform, invokeSafe } from "./bridge";

/**
 * Keep fixed controls below the Android status bar. The legacy StatusBar plugin
 * defaults to overlaying the WebView on Android <15; SystemBars' viewport-fit=contain
 * padding only applies on newer Android. This uses the plugin already in the shell.
 */
export const fitContent = async (darkMode = false): Promise<void> => {
  if (getPlatform() !== "android") return;
  await invokeSafe("StatusBar", "setOverlaysWebView", { overlay: false });
  // Disabling the legacy overlay restores its default black background. Match the
  // system appearance and icon contrast; newer enforced-edge-to-edge bars ignore
  // the background setter and retain their contained viewport's themed background.
  await invokeSafe("StatusBar", "setBackgroundColor", {
    color: darkMode ? "#000000" : "#ffffff",
  });
  await invokeSafe("StatusBar", "setStyle", { style: darkMode ? "DARK" : "LIGHT" });
};
