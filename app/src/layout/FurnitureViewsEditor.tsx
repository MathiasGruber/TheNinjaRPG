"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HOME_FURNITURE_FLOOR_DEPTH_RATIO,
  HOME_FURNITURE_MAX_WIDTH,
  HOME_FURNITURE_MIN_WIDTH,
  HOME_FURNITURE_ROTATION_DEGREES,
  HOME_FURNITURE_ROTATIONS,
  type HomeFurnitureRotation,
  IMG_AVATAR_DEFAULT,
} from "@/drizzle/constants";
import ContentImageSelector from "@/layout/ContentImageSelector";
import Image from "@/layout/Image";
import { getHomeFurnitureView } from "@/libs/home";
import { FURNITURE_IMAGE_PROMPT, furnitureViewPrompt } from "@/libs/imagePrompts";
import type {
  FurnitureGeometry,
  FurnitureImageBounds,
  FurnitureViews,
} from "@/validators/itemFurniture";

/** Author each direction independently, sharing the original design and per-view floor framing. */
export function FurnitureViewsEditor({
  id,
  name,
  description,
  image: savedImage,
  width,
  groundAnchor,
  geometry,
  useFullFootprint = false,
  views,
  onBaseChange,
  onViewsChange,
  onMeasurementPendingChange,
  canEdit,
  disabled,
}: FurnitureViewsEditorProps) {
  const image = savedImage === IMG_AVATAR_DEFAULT ? "" : savedImage;
  const [rotation, setRotation] = useState<HomeFurnitureRotation>(0);
  const degrees = HOME_FURNITURE_ROTATION_DEGREES[rotation];
  const viewKey = degrees === 0 ? null : degrees;
  const selectedImage = viewKey ? views[viewKey]?.image : image;
  const framing = getHomeFurnitureView(
    { image, width, groundAnchor, geometry, views },
    rotation,
  );
  const selectedGeometry = viewKey ? views[viewKey]?.geometry : geometry;
  const isImageDisabled = disabled || !canEdit;
  const originalMeasurement = api.item.getFurnitureImageGeometry.useQuery(
    { image: image || "", useFullFootprint },
    { enabled: Boolean(image) && !geometry && !isImageDisabled, retry: false },
  );
  const turnRotations = HOME_FURNITURE_ROTATIONS.filter((direction) => direction !== 0);
  // Every unfinished asset stays subscribed when staff moves between direction tabs.
  const turnMeasurements = api.useQueries((queries) =>
    turnRotations.map((direction) => {
      const view = views[HOME_FURNITURE_ROTATION_DEGREES[direction]];
      return queries.item.getFurnitureImageGeometry(
        { image: view?.image || "", useFullFootprint },
        {
          enabled: Boolean(view?.image) && !view?.geometry && !isImageDisabled,
          retry: false,
        },
      );
    }),
  );
  const measurement = turnMeasurements[rotation - 1] ?? originalMeasurement;
  const isMeasuring =
    originalMeasurement.isFetching ||
    turnMeasurements.some((result) => result.isFetching);
  const hasUnmeasuredImages =
    Boolean(image && !geometry) ||
    turnRotations.some((direction) => {
      const view = views[HOME_FURNITURE_ROTATION_DEGREES[direction]];
      return Boolean(view?.image && !view.geometry);
    });
  const isMeasurementPending = !isImageDisabled && (isMeasuring || hasUnmeasuredImages);
  const failedTurnMeasurement = turnMeasurements.find((result, index) => {
    const direction = turnRotations[index];
    const view = direction
      ? views[HOME_FURNITURE_ROTATION_DEGREES[direction]]
      : undefined;
    return !view?.geometry && (result.error || result.data?.success === false);
  });
  const failedMeasurement =
    !geometry &&
    (originalMeasurement.error || originalMeasurement.data?.success === false)
      ? originalMeasurement
      : !selectedGeometry && (measurement.error || measurement.data?.success === false)
        ? measurement
        : failedTurnMeasurement;

  useEffect(() => {
    onMeasurementPendingChange?.(isMeasurementPending);
    return () => onMeasurementPendingChange?.(false);
  }, [isMeasurementPending, onMeasurementPendingChange]);

  // Measure the original even when staff switches tabs while its asset is loading.
  useEffect(() => {
    const result = originalMeasurement.data;
    if (
      !result?.geometry ||
      result.image !== image ||
      result.useFullFootprint !== useFullFootprint ||
      geometry ||
      isImageDisabled
    )
      return;
    const measured = result.geometry;
    onBaseChange({
      geometry: measured,
      groundAnchor: measured.visibleBounds.y + measured.visibleBounds.height,
    });
  }, [
    originalMeasurement.data,
    image,
    useFullFootprint,
    geometry,
    isImageDisabled,
    onBaseChange,
  ]);

  // Publish completed measurements into their own assets, independent of the visible tab.
  useEffect(() => {
    if (!geometry || isImageDisabled) return;
    const next = { ...views };
    let hasChanges = false;
    turnMeasurements.forEach((measurement, index) => {
      const direction = turnRotations[index];
      if (!direction) return;
      const key = HOME_FURNITURE_ROTATION_DEGREES[direction];
      const view = views[key];
      const result = measurement.data;
      if (
        !view ||
        view.geometry ||
        !result?.geometry ||
        result.image !== view.image ||
        result.useFullFootprint !== useFullFootprint
      )
        return;
      const measured = result.geometry;
      next[key] = {
        ...view,
        geometry: measured,
        groundAnchor: measured.visibleBounds.y + measured.visibleBounds.height,
        width: matchingViewWidth(width, geometry, measured, direction),
      };
      hasChanges = true;
    });
    if (hasChanges) onViewsChange(next);
  }, [
    turnMeasurements,
    turnRotations,
    useFullFootprint,
    isImageDisabled,
    views,
    width,
    geometry,
    onViewsChange,
  ]);

  // Staff can adjust framing in suggestion drafts without permission to change images.
  const changeFraming = (field: "width" | "groundAnchor", value: number) => {
    if (disabled) return;
    if (viewKey) {
      const view = views[viewKey];
      if (view) onViewsChange({ ...views, [viewKey]: { ...view, [field]: value } });
    } else {
      onBaseChange({ [field]: value });
    }
  };

  const changeFootprint = (field: keyof FurnitureImageBounds, value: number) => {
    if (disabled || !selectedGeometry) return;
    const footprint = framing.geometry.footprint;
    const limit =
      field === "x"
        ? 100 - footprint.width
        : field === "y"
          ? 100 - footprint.height
          : field === "width"
            ? 100 - footprint.x
            : 100 - footprint.y;
    const next = {
      ...framing.geometry,
      footprint: {
        ...footprint,
        [field]: Math.min(
          limit,
          Math.max(field === "width" || field === "height" ? 0.01 : 0, value),
        ),
      },
    };
    if (viewKey) {
      const view = views[viewKey];
      if (view) onViewsChange({ ...views, [viewKey]: { ...view, geometry: next } });
    } else onBaseChange({ geometry: next });
  };

  return (
    <div className="mt-4 space-y-3">
      <h3 className="font-medium">Furniture views</h3>
      <p className="text-muted-foreground text-sm">
        Create the original first, then generate each turn from it. Recreate a view or
        edit its image to correct inconsistencies. Players can use completed views.
      </p>
      <Tabs
        value={String(rotation)}
        onValueChange={(value) => setRotation(Number(value) as HomeFurnitureRotation)}
      >
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1">
          {HOME_FURNITURE_ROTATIONS.map((direction) => {
            const angle = HOME_FURNITURE_ROTATION_DEGREES[direction];
            const url = angle === 0 ? image : views[angle]?.image;
            return (
              <TabsTrigger
                key={direction}
                value={String(direction)}
                className="min-w-0 flex-col gap-1 py-2"
              >
                {url ? (
                  <Image
                    src={url}
                    alt=""
                    width={128}
                    height={96}
                    className="h-12 w-full object-contain sm:h-16"
                  />
                ) : (
                  <span className="flex h-12 items-center text-muted-foreground text-xs sm:h-16">
                    Missing
                  </span>
                )}
                <span>
                  {angle}°{angle === 0 ? " · Original" : ""}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <ContentImageSelector
            key={`${id}:${degrees}`}
            label={`${degrees}° image`}
            imageUrl={selectedImage}
            id={`${id}:furniture:${degrees}`}
            prompt={furnitureViewPrompt(
              [name, description].filter(Boolean).join(" "),
              rotation,
            )}
            preprompt={FURNITURE_IMAGE_PROMPT}
            provider="OPENAI"
            emptyImageLabel="Generate or upload this view"
            referenceImageUrl={rotation === 0 ? undefined : image || undefined}
            allowImageUpload={canEdit}
            disabled={isImageDisabled || (rotation !== 0 && (!image || !geometry))}
            type="item"
            size={rotation === 1 || rotation === 3 ? "portrait" : "landscape"}
            maxDim={768}
            onUploadComplete={(url) => {
              if (isImageDisabled) return;
              if (viewKey)
                onViewsChange({
                  ...views,
                  [viewKey]: { ...views[viewKey], image: url, geometry: undefined },
                });
              else onBaseChange({ image: url, geometry: undefined });
            }}
          />
          {isMeasuring && (
            <p role="status" className="text-muted-foreground text-sm">
              Measuring furniture framing…
            </p>
          )}
          {failedMeasurement && (
            <div role="alert" className="space-y-2 text-destructive text-sm">
              <p>
                {failedMeasurement.data?.message ||
                  "Furniture framing could not be measured."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isImageDisabled || failedMeasurement.isFetching}
                onClick={() => void failedMeasurement.refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry measurement
              </Button>
            </div>
          )}
          {selectedImage && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${id}-${degrees}-width`}>Scene width (%)</Label>
                <NumberInput
                  id={`${id}-${degrees}-width`}
                  value={framing.width}
                  min={HOME_FURNITURE_MIN_WIDTH}
                  max={HOME_FURNITURE_MAX_WIDTH}
                  step="any"
                  disabled={disabled}
                  onValueChange={(value) => changeFraming("width", value)}
                />
              </div>
              <div>
                <Label htmlFor={`${id}-${degrees}-anchor`}>Ground anchor (%)</Label>
                <NumberInput
                  id={`${id}-${degrees}-anchor`}
                  value={framing.groundAnchor}
                  min={1}
                  max={100}
                  step="any"
                  disabled={disabled}
                  onValueChange={(value) => changeFraming("groundAnchor", value)}
                />
              </div>
            </div>
          )}
          {selectedImage && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm">Ground footprint</summary>
              <p className="mt-2 text-muted-foreground text-xs">
                Blue marks the area touching the floor. Include the full surface for
                beds and rugs, and the feet for tall furniture. Values are percentages
                of the original image.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(["x", "y", "width", "height"] as const).map((field) => (
                  <div key={field}>
                    <Label
                      htmlFor={`${id}-${degrees}-footprint-${field}`}
                    >{`Footprint ${field} (%)`}</Label>
                    <NumberInput
                      id={`${id}-${degrees}-footprint-${field}`}
                      value={framing.geometry.footprint[field]}
                      min={field === "width" || field === "height" ? 0.01 : 0}
                      max={100}
                      step="any"
                      disabled={disabled || !selectedGeometry}
                      onValueChange={(value) => changeFootprint(field, value)}
                    />
                  </div>
                ))}
              </div>
              {viewKey && geometry && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={disabled}
                  onClick={() =>
                    changeFraming(
                      "width",
                      matchingViewWidth(width, geometry, framing.geometry, rotation),
                    )
                  }
                >
                  Match original size
                </Button>
              )}
            </details>
          )}
          {viewKey && selectedImage && canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                const next = { ...views };
                delete next[viewKey];
                onViewsChange(next);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove this view
            </Button>
          )}
        </div>
        <div className="space-y-2">
          <div
            role="img"
            aria-label={`${degrees}° furniture scene preview`}
            className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-stone-200 dark:bg-stone-800"
          >
            <div className="absolute inset-x-0 top-3/4 border-stone-500 border-t border-dashed" />
            {selectedImage ? (
              <div
                className="absolute top-3/4 left-1/2"
                style={{
                  width: `${framing.width}%`,
                  aspectRatio: framing.geometry.aspectRatio,
                  transform: `translate(-50%, -${framing.groundAnchor}%)`,
                }}
              >
                <Image
                  src={selectedImage}
                  alt={name}
                  width={400}
                  height={Math.round(400 / framing.geometry.aspectRatio)}
                  className="h-full w-full object-contain"
                />
                <div
                  className="pointer-events-none absolute border border-amber-500"
                  style={boundsStyle(framing.geometry.visibleBounds)}
                />
                <div
                  className="pointer-events-none absolute border border-blue-500 bg-blue-500/20"
                  style={boundsStyle(framing.geometry.footprint)}
                />
              </div>
            ) : (
              <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-muted-foreground text-sm">
                {image
                  ? "Generate or upload this view."
                  : "Create the original image first."}
              </p>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Yellow follows the cutout; blue shows occupied floor space. New turns match
            the original size automatically; adjust framing when the artwork differs.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Match the source-native painted length, foreshortening quarter turns for the fixed room camera. */
const matchingViewWidth = (
  width: number,
  original: FurnitureGeometry | undefined,
  next: FurnitureGeometry,
  rotation: HomeFurnitureRotation,
) => {
  if (!original) return width;
  const extent = (view: FurnitureGeometry) =>
    Math.max(view.visibleBounds.width, view.visibleBounds.height / view.aspectRatio);
  return Math.min(
    HOME_FURNITURE_MAX_WIDTH,
    Math.max(
      HOME_FURNITURE_MIN_WIDTH,
      (width *
        extent(original) *
        (rotation === 1 || rotation === 3 ? HOME_FURNITURE_FLOOR_DEPTH_RATIO : 1)) /
        extent(next),
    ),
  );
};

/** Overlay source-image coordinates on the staff preview without altering its cutout. */
const boundsStyle = (bounds: FurnitureImageBounds) => ({
  left: `${bounds.x}%`,
  top: `${bounds.y}%`,
  width: `${bounds.width}%`,
  height: `${bounds.height}%`,
});

type FurnitureViewsEditorProps = {
  id: string;
  name: string;
  description?: string | null;
  image: string;
  width: number;
  groundAnchor: number;
  geometry?: FurnitureGeometry;
  useFullFootprint?: boolean;
  views: FurnitureViews;
  onBaseChange: (
    change: Partial<{
      image: string;
      width: number;
      groundAnchor: number;
      geometry: FurnitureGeometry;
    }>,
  ) => void;
  onViewsChange: (views: FurnitureViews) => void;
  onMeasurementPendingChange?: (pending: boolean) => void;
  canEdit: boolean;
  disabled?: boolean;
};
