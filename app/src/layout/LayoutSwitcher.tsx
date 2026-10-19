"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { GameLayout } from "@/components/layout/GameLayout";
import { PanelPublicLayout } from "@/components/layout/PanelPublicLayout";
import PixelPublicLayout from "@/components/layout/PixelPublicLayout";
import ParticleProvider from "@/components/ui/particles";
import { safeLocalStorageGetItem } from "@/hooks/localstorage";
import { applyGameLayout } from "@/hooks/useGameLayout";
import { getGameLayout } from "@/libs/gameLayouts";
import {
  applyFontScaleCookie,
  type EffectiveLayout,
  LAYOUT_PREFERENCE_COOKIE,
  persistLayoutPreferenceCookie,
  storedValueToLayout,
} from "@/libs/layoutPreference";
import type { WallpaperVariant } from "@/libs/wallpaperExperiment";
import { LayoutContextProvider } from "@/utils/LayoutContext";
import { usePublicPathname } from "@/utils/routing";
import { useUserData } from "@/utils/UserContext";

interface LayoutSwitcherProps {
  children: React.ReactNode;
  initialIsSignedIn: boolean;
  initialLayout: EffectiveLayout;
  wallpaper?: WallpaperVariant;
}

/**
 * LayoutSwitcher renders the shell for the layout the proxy chose
 * - Layout choices apply both in game and on the welcome page
 * - Authentication determines the frame, independently of the selected design
 */
const LayoutSwitcher: React.FC<LayoutSwitcherProps> = ({
  children,
  initialIsSignedIn,
  initialLayout,
  wallpaper,
}) => {
  const pathname = usePublicPathname();
  const { isClerkLoaded, isSignedIn } = useUserData();
  // Explicit choices replace only the presentation; remounting the root shell would
  // also restart Clerk and could activate another saved account after sign-out.
  const [displayedLayout, setDisplayedLayout] = useState(initialLayout);

  // The server picks the layout from the cookie; localStorage is only a recovery source
  // for when that cookie is lost (Safari caps JS-set cookies at 7 days, so it expires
  // for anyone who visits less often than weekly). Swapping the shell here after
  // hydration replaced the entire viewport in one frame, which is among the largest
  // layout-shift events on the site. The stored preference is re-synced to the cookie so
  // the *next* request renders the right shell, and the current render is left alone.
  useEffect(() => {
    const stored = storedValueToLayout(
      safeLocalStorageGetItem(LAYOUT_PREFERENCE_COOKIE),
    );
    // A public welcome rollout must not become the visitor's game preference.
    if (stored || initialIsSignedIn) {
      persistLayoutPreferenceCookie(stored ?? initialLayout);
    }
  }, [initialLayout, initialIsSignedIn]);

  const isKnownAnonymous = isClerkLoaded ? !isSignedIn : !initialIsSignedIn;
  useEffect(() => {
    applyGameLayout(displayedLayout);
    // A change of shell variant mid-session remounts everything under <html>, and React
    // strips what the head script set on it; put the font scale back.
    applyFontScaleCookie();
  }, [displayedLayout]);

  const definition = getGameLayout(displayedLayout);
  const isPixelLanding =
    definition.publicFrame === "landing" && pathname === "/" && isKnownAnonymous;
  const publicFrames = { landing: PixelPublicLayout, page: PanelPublicLayout };
  const PublicFrame =
    definition.publicFrame === "game"
      ? undefined
      : publicFrames[definition.publicFrame];
  const content =
    isKnownAnonymous &&
    PublicFrame &&
    (isPixelLanding || definition.publicFrame === "page") ? (
      <PublicFrame>{children}</PublicFrame>
    ) : (
      <GameLayout initialIsSignedIn={initialIsSignedIn}>{children}</GameLayout>
    );

  return (
    <LayoutContextProvider
      isPixelLanding={isPixelLanding}
      value={displayedLayout}
      onLayoutChange={setDisplayedLayout}
      wallpaper={wallpaper}
    >
      {content}
      <ParticleProvider />
    </LayoutContextProvider>
  );
};

export default LayoutSwitcher;
