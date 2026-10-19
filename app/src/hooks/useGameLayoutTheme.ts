"use client";

import { useCallback, useSyncExternalStore } from "react";
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from "@/hooks/localstorage";
import {
  type EffectiveLayout,
  LAYOUT_PREFERENCE_COOKIE,
  persistLayoutPreferenceCookie,
} from "@/libs/layoutPreference";
import {
  DEFAULT_GAME_LAYOUT_THEME,
  GAME_LAYOUT_THEME_ATTRIBUTE,
  GAME_LAYOUT_THEME_STORAGE_KEY,
  type GameLayoutThemeId,
  getGameLayoutTheme,
  toGameLayoutThemeId,
} from "@/libs/layoutThemes";
import { useChangeLayout } from "@/utils/LayoutContext";

const THEME_CHANGE_EVENT = "tnr-layout-theme-change";

export const readGameLayoutTheme = (
  defaultTheme: GameLayoutThemeId = DEFAULT_GAME_LAYOUT_THEME,
): GameLayoutThemeId => {
  try {
    return (
      toGameLayoutThemeId(
        JSON.parse(safeLocalStorageGetItem(GAME_LAYOUT_THEME_STORAGE_KEY) ?? "null"),
      ) ?? defaultTheme
    );
  } catch {
    return defaultTheme;
  }
};

export const applyGameLayoutTheme = (id: GameLayoutThemeId) => {
  const theme = getGameLayoutTheme(id);
  document.documentElement.setAttribute(GAME_LAYOUT_THEME_ATTRIBUTE, theme.id);
  document.documentElement.classList.toggle("dark", theme.tone === "dark");
};

export const selectGameLayoutTheme = (id: GameLayoutThemeId) => {
  safeLocalStorageSetItem(GAME_LAYOUT_THEME_STORAGE_KEY, JSON.stringify(id));
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
};

const subscribe = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === GAME_LAYOUT_THEME_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
};

export const useGameLayoutTheme = (
  defaultTheme: GameLayoutThemeId = DEFAULT_GAME_LAYOUT_THEME,
) => {
  const getSnapshot = useCallback(
    () => readGameLayoutTheme(defaultTheme),
    [defaultTheme],
  );
  const getServerSnapshot = useCallback(() => defaultTheme, [defaultTheme]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};

/** Persist the presentation choice without changing the active session or navigating to login. */
export const useSelectGameLayout = () => {
  const changeLayout = useChangeLayout();
  return useCallback(
    (layout: EffectiveLayout) => {
      safeLocalStorageSetItem(LAYOUT_PREFERENCE_COOKIE, JSON.stringify(layout));
      persistLayoutPreferenceCookie(layout);
      changeLayout(layout);
    },
    [changeLayout],
  );
};
