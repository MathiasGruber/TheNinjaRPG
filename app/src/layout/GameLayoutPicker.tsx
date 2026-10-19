"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GAME_LAYOUTS, type GameLayoutId, toGameLayoutId } from "@/libs/gameLayouts";

export function GameLayoutPicker({
  layout,
  onLayoutChange,
  className,
}: {
  layout: GameLayoutId;
  onLayoutChange: (layout: GameLayoutId) => void;
  className?: string;
}) {
  return (
    <Select
      value={layout}
      onValueChange={(value) => {
        const id = toGameLayoutId(value);
        if (id) onLayoutChange(id);
      }}
    >
      <SelectTrigger aria-label="Game layout" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GAME_LAYOUTS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
