"use client";

import { useMemo } from "react";
import { api } from "@/app/_trpc/client";
import Image from "@/layout/Image";
import SectorPreview from "@/layout/SectorPreview";
import { mergeDecorationAssets } from "@/libs/sector-map/decorations";
import { isValidSectorId } from "@/libs/sector-map/sector-ids";
import { mergeTerrainSpecs } from "@/libs/sector-map/terrains";
import type { MapLocation } from "@/validators/mapLocation";

/** Uses the player renderer against the published map, without publishing the editor draft. */
export const MapLocationPreview = ({
  location,
  isDynamic = false,
}: {
  location: MapLocation;
  isDynamic?: boolean;
}) => {
  const validSector = isValidSectorId(location.sector);
  const { data, isPending, error } = api.worldMap.getSectorWindow.useQuery(
    { sector: validSector ? location.sector : 0 },
    { enabled: validSector && !isDynamic, retry: false },
  );
  const { data: publicLocations = [] } = api.quests.getPublicLocations.useQuery(
    undefined,
    { enabled: validSector && !isDynamic },
  );
  const { data: assets = [] } = api.mapAsset.getAll.useQuery();
  const { data: terrains = [] } = api.mapTerrain.getAll.useQuery();
  const decorationAssets = useMemo(() => mergeDecorationAssets(assets), [assets]);
  const terrainRegistry = useMemo(() => mergeTerrainSpecs(terrains), [terrains]);
  const locations = useMemo(() => [location], [location]);
  const center = data?.sectors.find((entry) => entry.sector === location.sector);
  const map = center?.map;
  const asset = assets.find((entry) => entry.id === location.assetId);
  const collisions =
    center?.structures.filter(
      (structure) =>
        structure.longitude === location.longitude &&
        structure.latitude === location.latitude,
    ) ?? [];
  const overlappingLocations = publicLocations.filter(
    (entry) =>
      entry.sector === location.sector &&
      entry.longitude === location.longitude &&
      entry.latitude === location.latitude &&
      entry.objectiveId !== location.id,
  );
  if (isDynamic)
    return (
      <div className="rounded border p-3">
        <p className="font-semibold">Structure preview</p>
        {asset && (
          <Image
            src={asset.imageUrl}
            alt={location.name}
            width={160}
            height={160}
            className="h-40 w-40 object-contain"
          />
        )}
        <p className="text-muted-foreground text-sm">
          The structure follows the quest’s resolved target. Choose a fixed sector and
          tile for a map preview.
        </p>
      </div>
    );
  if (!validSector)
    return (
      <p className="text-muted-foreground text-sm">
        Choose a fixed sector to preview this structure.
      </p>
    );
  return (
    <div className="rounded border p-3">
      <p className="font-semibold">Structure preview</p>
      {overlappingLocations.length > 0 && (
        <p role="status" className="text-amber-700 text-sm">
          Other quest landmarks share this tile:{" "}
          {overlappingLocations.map((entry) => entry.name).join(", ")}. Only one
          structure will be drawn.
        </p>
      )}
      {collisions.length > 0 && (
        <p role="status" className="text-amber-700 text-sm">
          This tile also contains{" "}
          {collisions.map((structure) => structure.name).join(", ")}. Check that both
          locations remain readable.
        </p>
      )}
      {map ? (
        <SectorPreview
          map={map}
          sector={location.sector}
          decorationAssets={decorationAssets}
          terrainRegistry={terrainRegistry}
          structures={center.structures}
          villageType={center.villageType}
          locations={locations}
          mapAssets={assets}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {error?.message ??
            (isPending
              ? "Loading sector preview…"
              : "This sector has no published map.")}
        </p>
      )}
    </div>
  );
};
