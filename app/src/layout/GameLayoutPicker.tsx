"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectGameLayoutTheme, useGameLayoutTheme } from "@/hooks/useGameLayoutTheme";
import type { EffectiveLayout } from "@/libs/layoutPreference";
import {
  GAME_LAYOUT_THEMES,
  type GameLayoutThemeId,
  toGameLayoutThemeId,
} from "@/libs/layoutThemes";

export function GameLayoutPicker({
  layout,
  onLayoutChange,
  className,
  defaultTheme,
}: {
  layout: EffectiveLayout;
  onLayoutChange: (layout: EffectiveLayout) => void;
  className?: string;
  defaultTheme?: GameLayoutThemeId;
}) {
  const selectedTheme = useGameLayoutTheme(defaultTheme);
  return (
    <Select
      value={layout === "themed" ? selectedTheme : layout}
      onValueChange={(value) => {
        const id = toGameLayoutThemeId(value);
        if (id) {
          selectGameLayoutTheme(id);
          onLayoutChange("themed");
        } else if (value === "default" || value === "pixel") {
          onLayoutChange(value);
        }
      }}
    >
      <SelectTrigger aria-label="Game layout" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Classic</SelectItem>
        <SelectItem value="pixel">Pixel</SelectItem>
        {GAME_LAYOUT_THEMES.map((theme) => (
          <SelectItem key={theme.id} value={theme.id}>
            {theme.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
