import { Grid, Orientation, rectangle } from "honeycomb-grid";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { getTargetTiles } from "@/libs/combat/targeting";
import type { CombatAction } from "@/libs/combat/types";
import { defineHex } from "@/libs/hexgrid";

export const CombatTargetPreview = ({
  action,
}: {
  action: Pick<CombatAction, "method" | "range" | "coordinateTargeting" | "methodSize">;
}) => {
  const [columns, setColumns] = useState(12);
  const width =
    Number.isInteger(columns) && columns >= 1 && columns <= 20 ? columns : 12;
  const [rows, setRows] = useState(10);
  const height = Number.isInteger(rows) && rows >= 1 && rows <= 20 ? rows : 10;
  const [caster, setCaster] = useState({ col: 2, row: 4 });
  const [target, setTarget] = useState({ col: 7, row: 4 });
  const [placing, setPlacing] = useState<"caster" | "target">("target");
  const [focusedTile, setFocusedTile] = useState({ col: 0, row: 0 });
  const focusedCol = Math.min(focusedTile.col, width - 1);
  const focusedRow = Math.min(focusedTile.row, height - 1);
  const Tile = defineHex({ dimensions: 20, orientation: Orientation.FLAT });
  const grid = new Grid(Tile, rectangle({ width, height }));
  const a = grid.getHex({
    col: Math.min(caster.col, width - 1),
    row: Math.min(caster.row, height - 1),
  });
  const b = grid.getHex({
    col: Math.min(target.col, width - 1),
    row: Math.min(target.row, height - 1),
  });
  const tiles = grid.toArray();
  if (!a || !b) return null;
  const affected = new Set(getTargetTiles({ a, b, action, grid }));
  const corners = tiles.flatMap((tile) => tile.corners);
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  const random =
    action.method === "COORDINATES" &&
    action.coordinateTargeting?.selection === "RANDOM";
  const place = (col: number, row: number) =>
    (placing === "caster" ? setCaster : setTarget)({ col, row });

  return (
    <div className="space-y-2 rounded border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sm">Combat grid preview</span>
        <NumberInput
          aria-label="Preview columns"
          className="w-16"
          min={1}
          max={20}
          value={columns}
          onValueChange={setColumns}
        />
        <span className="text-sm">columns ×</span>
        <NumberInput
          aria-label="Preview rows"
          className="w-16"
          min={1}
          max={20}
          value={rows}
          onValueChange={setRows}
        />
        <span className="text-sm">rows</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={placing === "caster" ? "default" : "outline"}
          aria-pressed={placing === "caster"}
          onClick={() => setPlacing("caster")}
        >
          Place caster (C)
        </Button>
        <Button
          type="button"
          size="sm"
          variant={placing === "target" ? "default" : "outline"}
          aria-pressed={placing === "target"}
          onClick={() => setPlacing("target")}
        >
          Place target (T)
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Click a tile or use arrow keys and Enter or Space to move the preview {placing}.
        Green tiles show the footprint before character, range and barrier checks. C =
        caster, T = target. Map edges clip the pattern.
      </p>
      <svg
        aria-label="Combat grid preview"
        viewBox={`${minX - 2} ${minY - 2} ${maxX - minX + 4} ${maxY - minY + 4}`}
        className="w-full max-w-md"
      >
        {tiles.map((tile) => {
          const name = `${String.fromCharCode(65 + tile.col)}${tile.row + 1}`;
          const selected = affected.has(tile);
          const marker = [tile === a ? "C" : "", tile === b ? "T" : ""]
            .filter(Boolean)
            .join("/");
          return (
            // One tab stop enters the SVG; arrow keys move focus between its tile controls.
            // biome-ignore lint/a11y/useSemanticElements: SVG tile controls require a group.
            <g
              key={name}
              role="button"
              tabIndex={tile.col === focusedCol && tile.row === focusedRow ? 0 : -1}
              data-tile={`${tile.col},${tile.row}`}
              aria-label={`${name} (${tile.col}, ${tile.row})${selected ? " affected" : ""}${marker ? ` ${marker}` : ""}`}
              onFocus={() => setFocusedTile({ col: tile.col, row: tile.row })}
              onClick={(event) => {
                event.currentTarget.focus();
                place(tile.col, tile.row);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  place(tile.col, tile.row);
                  return;
                }
                const direction = TILE_DIRECTIONS.find(
                  (direction) => direction.key === event.key,
                );
                if (!direction) return;
                event.preventDefault();
                const col = Math.max(0, Math.min(width - 1, tile.col + direction.dx));
                const row = Math.max(0, Math.min(height - 1, tile.row + direction.dy));
                event.currentTarget.parentElement
                  ?.querySelector<SVGGElement>(`[data-tile="${col},${row}"]`)
                  ?.focus();
              }}
              className="cursor-pointer outline-none focus:opacity-60"
            >
              <title>{`${name} (${tile.col}, ${tile.row})${selected ? " — affected" : ""}`}</title>
              <polygon
                points={tile.corners.map((point) => `${point.x},${point.y}`).join(" ")}
                fill={selected ? "#15803d" : "#334155"}
                stroke={marker ? "#fbbf24" : "#94a3b8"}
                strokeWidth={marker ? 2 : 0.5}
              />
              <text
                x={tile.x}
                y={tile.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={marker ? 11 : 8}
                className="pointer-events-none"
              >
                {marker || name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-sm" aria-live="polite">
        {affected.size}{" "}
        {random
          ? `candidate tiles; up to ${action.coordinateTargeting?.randomCount ?? 1} chosen per cast`
          : "affected tiles"}
        . Caster: ({a.col}, {a.row}); target: ({b.col}, {b.row}).
      </p>
    </div>
  );
};

const TILE_DIRECTIONS = [
  { key: "ArrowLeft", dx: -1, dy: 0 },
  { key: "ArrowRight", dx: 1, dy: 0 },
  { key: "ArrowUp", dx: 0, dy: -1 },
  { key: "ArrowDown", dx: 0, dy: 1 },
];
