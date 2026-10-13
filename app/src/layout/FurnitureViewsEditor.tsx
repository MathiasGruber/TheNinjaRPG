"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
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
import type { FurnitureViews } from "@/validators/itemFurniture";

/** Author each direction independently, sharing the original design and per-view floor framing. */
export function FurnitureViewsEditor({
  id,
  name,
  description,
  image: savedImage,
  width,
  groundAnchor,
  views,
  onBaseChange,
  onViewsChange,
  canEdit,
  disabled,
}: FurnitureViewsEditorProps) {
  const image = savedImage === IMG_AVATAR_DEFAULT ? "" : savedImage;
  const [rotation, setRotation] = useState<HomeFurnitureRotation>(0);
  const degrees = HOME_FURNITURE_ROTATION_DEGREES[rotation];
  const viewKey = degrees === 0 ? null : degrees;
  const selectedImage = viewKey ? views[viewKey]?.image : image;
  const framing = getHomeFurnitureView({ image, width, groundAnchor, views }, rotation);
  const isDisabled = disabled || !canEdit;

  const changeFraming = (field: "width" | "groundAnchor", value: number) => {
    if (isDisabled) return;
    if (viewKey) {
      const view = views[viewKey];
      if (view) onViewsChange({ ...views, [viewKey]: { ...view, [field]: value } });
    } else {
      onBaseChange({ [field]: value });
    }
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
            disabled={isDisabled || (rotation !== 0 && !image)}
            type="item"
            size={rotation === 1 || rotation === 3 ? "portrait" : "landscape"}
            maxDim={768}
            onUploadComplete={(url) => {
              if (isDisabled) return;
              if (viewKey)
                onViewsChange({
                  ...views,
                  [viewKey]: { ...views[viewKey], image: url },
                });
              else onBaseChange({ image: url });
            }}
          />
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
                  disabled={isDisabled}
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
                  disabled={isDisabled}
                  onValueChange={(value) => changeFraming("groundAnchor", value)}
                />
              </div>
            </div>
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
                  transform: `translate(-50%, -${framing.groundAnchor}%)`,
                }}
              >
                <Image
                  src={selectedImage}
                  alt={name}
                  width={400}
                  height={300}
                  className="h-auto w-full object-contain"
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
            Adjust each view's size and floor contact point. An anchor of 100 uses the
            bottom edge of the image.
          </p>
        </div>
      </div>
    </div>
  );
}

type FurnitureViewsEditorProps = {
  id: string;
  name: string;
  description?: string | null;
  image: string;
  width: number;
  groundAnchor: number;
  views: FurnitureViews;
  onBaseChange: (
    change: Partial<{ image: string; width: number; groundAnchor: number }>,
  ) => void;
  onViewsChange: (views: FurnitureViews) => void;
  canEdit: boolean;
  disabled?: boolean;
};
