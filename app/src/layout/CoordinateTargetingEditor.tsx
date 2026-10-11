import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CoordinateOrigins,
  CoordinateSelections,
  type CoordinateTargeting,
  coordinateTargetingSchema,
} from "@/validators/coordinateTargeting";

export const CoordinateTargetingEditor = (props: {
  value?: CoordinateTargeting | null;
  onChange: (value: CoordinateTargeting | null) => void;
  readonly?: boolean;
}) => {
  const pattern = props.value ?? {
    origin: "BATTLEFIELD",
    selection: "ALL",
    coordinates: [],
    randomCount: 1,
  };
  const update = (changes: Partial<CoordinateTargeting>) =>
    props.onChange({ ...pattern, ...changes });
  const validation = props.value
    ? coordinateTargetingSchema.safeParse(props.value)
    : undefined;
  return (
    <div className="space-y-3 rounded border p-3">
      <p className="text-muted-foreground text-sm">
        Battlefield coordinates use column and row starting at 0: A1 is (0, 0), B2 is
        (1, 1). Caster and Target use column/row offsets from that tile; negative
        offsets are allowed. Target anchors stay within the action’s range. Battlefield
        and Caster patterns can cover the whole map. Coordinates outside the map are
        ignored.
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label>Coordinate origin</Label>
          <Select
            value={pattern.origin}
            disabled={props.readonly}
            onValueChange={(origin: CoordinateTargeting["origin"]) =>
              update({ origin })
            }
          >
            <SelectTrigger aria-label="Coordinate origin">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CoordinateOrigins.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Tile selection</Label>
          <Select
            value={pattern.selection}
            disabled={props.readonly}
            onValueChange={(selection: CoordinateTargeting["selection"]) =>
              update({ selection })
            }
          >
            <SelectTrigger aria-label="Tile selection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CoordinateSelections.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "ALL"
                    ? "Listed tiles"
                    : value === "EXCLUDE"
                      ? "All except listed tiles"
                      : "Random tiles"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pattern.selection === "RANDOM" && (
          <div className="space-y-1">
            <Label>Random tile count</Label>
            <NumberInput
              min={1}
              aria-label="Random tile count"
              value={pattern.randomCount}
              disabled={props.readonly}
              onValueChange={(randomCount) => update({ randomCount })}
            />
          </div>
        )}
      </div>
      {pattern.selection === "RANDOM" && (
        <p className="text-muted-foreground text-sm">
          Leave the list empty to choose from the whole map, or list candidate tiles.
          Each cast chooses valid tiles without repeats. Combat previews show all
          candidates.
        </p>
      )}
      <div className="space-y-2">
        {pattern.coordinates.map((coordinate, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
          >
            <NumberInput
              step={1}
              aria-label={`Coordinate ${index + 1} column`}
              value={coordinate.longitude}
              disabled={props.readonly}
              onValueChange={(value) =>
                update({
                  coordinates: pattern.coordinates.map((entry, i) =>
                    i === index ? { ...entry, longitude: value } : entry,
                  ),
                })
              }
            />
            <NumberInput
              step={1}
              aria-label={`Coordinate ${index + 1} row`}
              value={coordinate.latitude}
              disabled={props.readonly}
              onValueChange={(value) =>
                update({
                  coordinates: pattern.coordinates.map((entry, i) =>
                    i === index ? { ...entry, latitude: value } : entry,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Remove coordinate ${index + 1}`}
              disabled={props.readonly}
              onClick={() =>
                update({
                  coordinates: pattern.coordinates.filter((_, i) => i !== index),
                })
              }
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      {validation && !validation.success && (
        <p role="alert" className="text-destructive text-sm">
          {validation.error.issues[0]?.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={props.readonly}
          onClick={() => {
            let longitude = 0;
            while (
              pattern.coordinates.some(
                (entry) => entry.longitude === longitude && entry.latitude === 0,
              )
            )
              longitude++;
            update({
              coordinates: [...pattern.coordinates, { longitude, latitude: 0 }],
            });
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add coordinate
        </Button>
        {props.value && (
          <Button
            type="button"
            variant="outline"
            disabled={props.readonly}
            onClick={() => props.onChange(null)}
          >
            Clear pattern
          </Button>
        )}
      </div>
    </div>
  );
};
