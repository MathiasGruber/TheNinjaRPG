"use client";

import type React from "react";
import { createContext, useContext } from "react";
import type { EffectiveLayout } from "@/libs/layoutPreference";
import type { WallpaperVariant } from "@/libs/wallpaperExperiment";

const LayoutContext = createContext<EffectiveLayout>("default");
const LayoutChangeContext = createContext<(layout: EffectiveLayout) => void>(() => {});
export const useChangeLayout = () => useContext(LayoutChangeContext);
const WallpaperContext = createContext<WallpaperVariant | undefined>(undefined);
export const useWallpaperVariant = () => useContext(WallpaperContext);

const PixelLandingContext = createContext(false);

export const LayoutContextProvider: React.FC<{
  children: React.ReactNode;
  isPixelLanding: boolean;
  value: EffectiveLayout;
  onLayoutChange?: (layout: EffectiveLayout) => void;
  wallpaper?: WallpaperVariant;
}> = ({ children, isPixelLanding, value, onLayoutChange, wallpaper }) => {
  return (
    <LayoutContext value={value}>
      <LayoutChangeContext value={onLayoutChange ?? (() => {})}>
        <WallpaperContext value={wallpaper}>
          <PixelLandingContext value={isPixelLanding}>{children}</PixelLandingContext>
        </WallpaperContext>
      </LayoutChangeContext>
    </LayoutContext>
  );
};

export const useActiveLayout = () => {
  return useContext(LayoutContext);
};

export const useIsPixelLanding = () => {
  return useContext(PixelLandingContext);
};
