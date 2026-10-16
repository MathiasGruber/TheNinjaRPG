import { Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import Modal from "@/layout/Modal";
import { getTargetTiles } from "@/libs/combat/targeting";
import type { CombatAction } from "@/libs/combat/types";
import type { BattlefieldPreview } from "@/libs/threejs/battlefieldPreview";

/**
 * Optional targeting help, mounted only on request so editing never pays for a WebGL scene.
 * The shared dialog bounds its height and returns focus to this field's preview button.
 */
export const CombatTargetPreview = ({
  action,
}: {
  action: Pick<CombatAction, "method" | "range" | "coordinateTargeting" | "methodSize">;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(true)}
      >
        <Eye className="mr-1 h-4 w-4" /> Preview targeting
      </Button>
      {isOpen && (
        <Modal
          title="Combat targeting preview"
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          returnFocusRef={triggerRef}
          className="md:max-w-3xl"
        >
          <TargetingBattlefield action={action} />
        </Modal>
      )}
    </>
  );
};

/** The proposal preview's real combat field, with local anchors and accessible tile controls. */
const TargetingBattlefield = ({
  action,
}: {
  action: Parameters<typeof CombatTargetPreview>[0]["action"];
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loadedPreview, setLoadedPreview] = useState<{
    field: BattlefieldPreview;
    width: number;
    height: number;
  } | null>(null);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [columns, setColumns] = useState(12);
  const width =
    Number.isInteger(columns) && columns >= 1 && columns <= 20 ? columns : 12;
  const [rows, setRows] = useState(10);
  const height = Number.isInteger(rows) && rows >= 1 && rows <= 20 ? rows : 10;
  const preview =
    loadedPreview?.width === width && loadedPreview.height === height
      ? loadedPreview.field
      : null;
  const [caster, setCaster] = useState({ col: 2, row: 4 });
  const [target, setTarget] = useState({ col: 7, row: 4 });
  const [placing, setPlacing] = useState<"caster" | "target">("target");
  const [focusedTile, setFocusedTile] = useState({ col: 0, row: 0 });
  // Clamp displayed positions when the map shrinks without discarding the saved anchors.
  const focusedCol = Math.min(focusedTile.col, width - 1);
  const focusedRow = Math.min(focusedTile.row, height - 1);
  const grid = preview?.grid;
  const a = grid?.getHex({
    col: Math.min(caster.col, width - 1),
    row: Math.min(caster.row, height - 1),
  });
  const b = grid?.getHex({
    col: Math.min(target.col, width - 1),
    row: Math.min(target.row, height - 1),
  });
  const tiles = grid?.toArray() ?? [];
  const affected = new Set(
    a && b && grid ? getTargetTiles({ a, b, action, grid }) : [],
  );
  const random =
    action.method === "COORDINATES" &&
    action.coordinateTargeting?.selection === "RANDOM";
  const place = (col: number, row: number) =>
    (placing === "caster" ? setCaster : setTarget)({ col, row });

  useEffect(() => {
    let isDisposed = false;
    let field: BattlefieldPreview | null = null;
    setLoadedPreview(null);
    setIsUnsupported(false);
    // The heavy combat renderer is loaded only while this optional help dialog is open.
    void import("@/libs/threejs/battlefieldPreview")
      .then(({ createBattlefieldPreview }) => {
        if (isDisposed || !mountRef.current) return;
        field = createBattlefieldPreview({
          scene: { effects: [], targetAvatar: null, assets: [] },
          assets: [],
          viewport: "desktop",
          background: "ground",
          targeting: {
            width,
            height,
            caster: { col: Math.min(2, width - 1), row: Math.min(4, height - 1) },
            target: { col: Math.min(7, width - 1), row: Math.min(4, height - 1) },
          },
        });
        if (!field) {
          setIsUnsupported(true);
          return;
        }
        field.canvas.style.width = "100%";
        field.canvas.style.height = "auto";
        mountRef.current.appendChild(field.canvas);
        setLoadedPreview({ field, width, height });
        field.play();
      })
      .catch((error: unknown) => {
        console.error("Unable to load the targeting battlefield", error);
        if (!isDisposed) setIsUnsupported(true);
      });
    return () => {
      isDisposed = true;
      field?.dispose();
    };
  }, [width, height]);

  useEffect(() => {
    if (preview && a && b) preview.setTargeting(a, b, [...affected]);
  }, [preview, a, b, affected]);

  return (
    <div className="space-y-3">
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
        caster, T = target. Map edges clip the pattern. This help never changes the
        draft.
      </p>
      {isUnsupported && (
        <p role="alert" className="text-sm">
          The combat grid could not load. This preview requires WebGL; close and reopen
          it to retry.
        </p>
      )}
      <div
        className="relative mx-auto overflow-hidden rounded border bg-muted/30"
        style={
          preview
            ? { width: `min(100%, ${(55 * preview.width) / preview.height}dvh)` }
            : undefined
        }
      >
        <div ref={mountRef} className="[&>canvas]:block" />
        {!preview && !isUnsupported && (
          <p role="status" className="p-6 text-center text-sm">
            Loading combat grid…
          </p>
        )}
        {preview && (
          <svg
            aria-label="Combat grid preview"
            viewBox={`0 0 ${preview.width} ${preview.height}`}
            className="absolute inset-0 h-full w-full"
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
                    const col = Math.max(
                      0,
                      Math.min(width - 1, tile.col + direction.dx),
                    );
                    const row = Math.max(
                      0,
                      Math.min(height - 1, tile.row + direction.dy),
                    );
                    event.currentTarget.parentElement
                      ?.querySelector<SVGGElement>(`[data-tile="${col},${row}"]`)
                      ?.focus();
                  }}
                  className="cursor-pointer outline-none focus:[&>polygon]:stroke-yellow-400"
                >
                  <title>{`${name} (${tile.col}, ${tile.row})${selected ? " — affected" : ""}`}</title>
                  <polygon
                    points={tile.corners
                      .map((point) => `${point.x},${preview.height - point.y}`)
                      .join(" ")}
                    fill="transparent"
                    stroke={marker ? "#fbbf24" : "transparent"}
                    strokeWidth={2}
                  />
                  <text
                    x={tile.x}
                    y={preview.height - tile.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={marker ? 11 : 8}
                    className="pointer-events-none"
                  >
                    {marker}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <p className="text-sm" aria-live="polite">
        {affected.size}{" "}
        {random
          ? `candidate tiles; up to ${action.coordinateTargeting?.randomCount ?? 1} chosen per cast`
          : "affected tiles"}
        . Caster: ({a?.col ?? 0}, {a?.row ?? 0}); target: ({b?.col ?? 0}, {b?.row ?? 0}
        ).
      </p>
    </div>
  );
};

const TILE_DIRECTIONS = [
  { key: "ArrowLeft", dx: -1, dy: 0 },
  { key: "ArrowRight", dx: 1, dy: 0 },
  { key: "ArrowUp", dx: 0, dy: 1 },
  { key: "ArrowDown", dx: 0, dy: -1 },
];
