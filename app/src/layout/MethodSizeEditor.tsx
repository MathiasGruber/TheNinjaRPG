import { NumberInput } from "@/components/ui/number-input";
import { MAX_METHOD_SIZE } from "@/drizzle/constants";
import { CombatTargetPreview } from "@/layout/CombatTargetPreview";
import type { CombatAction } from "@/libs/combat/types";
import type { MethodSize } from "@/validators/methodSize";

export const MethodSizeEditor = ({
  value,
  onChange,
  method,
  range,
  readonly,
}: {
  value?: MethodSize | null;
  onChange: (value: MethodSize) => void;
  method: CombatAction["method"];
  range: number;
  readonly?: boolean;
}) => (
  <div className="space-y-3">
    <p className="text-muted-foreground text-sm">
      Expand the default method footprint by this many columns (X) and rows (Y) in each
      direction. Zero keeps the default size. Range still controls the target distance.
    </p>
    <div className="flex flex-wrap gap-3">
      {(["x", "y"] as const).map((axis) => (
        <div key={axis} className="space-y-1 text-sm">
          <span>Method size {axis.toUpperCase()}</span>
          <NumberInput
            aria-label={`Method size ${axis.toUpperCase()}`}
            min={0}
            max={MAX_METHOD_SIZE}
            step={1}
            value={value?.[axis] ?? 0}
            disabled={readonly}
            onValueChange={(size) =>
              onChange({ x: value?.x ?? 0, y: value?.y ?? 0, [axis]: size })
            }
          />
        </div>
      ))}
    </div>
    <CombatTargetPreview action={{ method, range, methodSize: value }} />
  </div>
);
