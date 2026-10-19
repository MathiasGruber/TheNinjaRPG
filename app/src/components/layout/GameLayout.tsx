"use client";

import type { ReactNode } from "react";
import {
  type GameLayout as GameLayoutDefinition,
  getGameLayout,
} from "@/libs/gameLayouts";
import { useActiveLayout } from "@/utils/LayoutContext";
import { ClassicGameLayout } from "./ClassicGameLayout";
import { PanelGameLayout } from "./PanelGameLayout";
import { PixelGameLayout } from "./PixelGameLayout";
import GameLayoutController from "./shared/GameLayoutController";
import type { GameLayoutRenderer } from "./shared/layoutTypes";

const GAME_FRAMES = {
  classic: ClassicGameLayout,
  pixel: PixelGameLayout,
  panel: PanelGameLayout,
} satisfies Record<GameLayoutDefinition["frame"], GameLayoutRenderer>;

export function GameLayout({
  children,
  initialIsSignedIn,
}: {
  children: ReactNode;
  initialIsSignedIn: boolean;
}) {
  const id = useActiveLayout();
  return (
    <GameLayoutController
      variant={id}
      renderer={GAME_FRAMES[getGameLayout(id).frame]}
      initialIsSignedIn={initialIsSignedIn}
    >
      {children}
    </GameLayoutController>
  );
}
