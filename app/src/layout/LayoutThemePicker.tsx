"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectGameLayoutTheme, useGameLayoutTheme } from "@/hooks/useGameLayoutTheme";
import { GAME_LAYOUT_THEMES, toGameLayoutThemeId } from "@/libs/layoutThemes";

export function LayoutThemePicker({ className }: { className?: string }) {
  const selectedTheme = useGameLayoutTheme();
  return (
    <Select
      value={selectedTheme}
      onValueChange={(value) => {
        const id = toGameLayoutThemeId(value);
        if (id) selectGameLayoutTheme(id);
      }}
    >
      <SelectTrigger aria-label="Shinobi layout" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GAME_LAYOUT_THEMES.map((theme) => (
          <SelectItem key={theme.id} value={theme.id}>
            {theme.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
