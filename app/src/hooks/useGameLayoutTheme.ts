"use client";

import { useSyncExternalStore } from "react";
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from "@/hooks/localstorage";
import {
  DEFAULT_GAME_LAYOUT_THEME,
  GAME_LAYOUT_THEME_ATTRIBUTE,
  GAME_LAYOUT_THEME_STORAGE_KEY,
  type GameLayoutThemeId,
  getGameLayoutTheme,
  toGameLayoutThemeId,
} from "@/libs/layoutThemes";

const THEME_CHANGE_EVENT = "tnr-layout-theme-change";

export const readGameLayoutTheme = (): GameLayoutThemeId => {
  try {
    return (
      toGameLayoutThemeId(
        JSON.parse(safeLocalStorageGetItem(GAME_LAYOUT_THEME_STORAGE_KEY) ?? "null"),
      ) ?? DEFAULT_GAME_LAYOUT_THEME
    );
  } catch {
    return DEFAULT_GAME_LAYOUT_THEME;
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

const getServerSnapshot = () => DEFAULT_GAME_LAYOUT_THEME;

export const useGameLayoutTheme = () =>
  useSyncExternalStore(subscribe, readGameLayoutTheme, getServerSnapshot);
