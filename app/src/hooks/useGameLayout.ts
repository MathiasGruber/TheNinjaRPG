"use client";

import { useCallback } from "react";
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from "@/hooks/localstorage";
import {
  GAME_LAYOUT_ATTRIBUTE,
  GAME_LAYOUT_FRAME_ATTRIBUTE,
  type GameLayoutId,
  getGameLayout,
} from "@/libs/gameLayouts";
import {
  LAYOUT_PREFERENCE_COOKIE,
  persistLayoutPreferenceCookie,
} from "@/libs/layoutPreference";
import { useChangeLayout } from "@/utils/LayoutContext";

export const applyGameLayout = (id: GameLayoutId) => {
  const layout = getGameLayout(id);
  document.documentElement.setAttribute(GAME_LAYOUT_ATTRIBUTE, layout.id);
  document.documentElement.setAttribute(GAME_LAYOUT_FRAME_ATTRIBUTE, layout.frame);
  document.documentElement.classList.toggle(
    "dark",
    layout.supportsColorMode
      ? safeLocalStorageGetItem("theme") === "dark"
      : layout.tone === "dark",
  );
};

/** Change presentation in place so Clerk and the active game session stay mounted. */
export const useSelectGameLayout = () => {
  const changeLayout = useChangeLayout();
  return useCallback(
    (layout: GameLayoutId) => {
      safeLocalStorageSetItem(LAYOUT_PREFERENCE_COOKIE, JSON.stringify(layout));
      persistLayoutPreferenceCookie(layout);
      changeLayout(layout);
    },
    [changeLayout],
  );
};
