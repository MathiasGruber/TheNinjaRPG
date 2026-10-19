"use client";

import { Button } from "@/components/ui/button";
import type { MapLocation } from "@/validators/mapLocation";

/** Arrival actions and another selected destination remain independently accessible. */
export const MapLocationActions = ({
  arrived,
  hovered,
  onInspect,
  onQuest,
  onGoTo,
}: {
  arrived: MapLocation[];
  hovered?: MapLocation;
  onInspect: (location: MapLocation, trigger: HTMLButtonElement) => void;
  onQuest: (questId: string) => void;
  onGoTo: (location: MapLocation) => void;
}) => {
  const arrivedIds = new Set(arrived.map((location) => location.id));
  const locations = [
    ...arrived,
    ...(hovered && !arrivedIds.has(hovered.id) ? [hovered] : []),
  ];
  if (!locations.length) return null;
  return (
    <div
      className="pointer-events-auto max-h-64 w-full space-y-2 overflow-y-auto rounded-lg bg-black/80 p-3 text-white shadow-lg"
      data-testid="map-location-card"
    >
      {locations.map((location) => (
        <div key={location.id}>
          <p className="truncate font-semibold" title={location.name}>
            {location.name}
          </p>
          {arrivedIds.has(location.id) ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="min-h-10"
                onClick={(event) => onInspect(location, event.currentTarget)}
              >
                Inspect
              </Button>
              {location.active && location.npcPlacementId && (
                <p className="w-full text-sm">Speak with the NPC here to continue.</p>
              )}
              {location.active && location.questId && !location.npcPlacementId && (
                <Button
                  size="sm"
                  className="min-h-10"
                  variant="secondary"
                  onClick={() => onQuest(location.questId as string)}
                >
                  Quest
                </Button>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              className="mt-2 h-auto min-h-10 w-full whitespace-normal break-words"
              onClick={() => onGoTo(location)}
            >
              Go to {location.name}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};
