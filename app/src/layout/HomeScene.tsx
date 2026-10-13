"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BedDouble,
  ChefHat,
  FlipHorizontal,
  House,
  Package,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ShoppingBag,
  Sprout,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HOME_FURNITURE_MAX_PLACEMENTS,
  HOME_FURNITURE_POSITION_MAX,
  HOME_FURNITURE_POSITION_MIN,
  type HomeType,
  HomeTypeDetails,
} from "@/drizzle/constants";
import Image from "@/layout/Image";
import Link from "@/layout/Link";
import Modal from "@/layout/Modal";
import { getDefaultHomeLayout, type HomeFurniture } from "@/libs/home";
import { cn } from "@/libs/shadui";
import { bunnyImageUrl } from "@/utils/image";
import type { HomePlacement } from "@/validators/home";

/** A furnished residence with a reversible editor; the page owns persistence and game actions. */
export const HomeScene = ({
  homeType,
  isGuest,
  isAsleep,
  isTogglingSleep,
  onSleep,
  onStorage,
  onManage,
  onFarm,
  layout = [],
  furniture = [],
  revision = 0,
  canDecorate = false,
  isSaving = false,
  isRefreshingFurniture = false,
  furnitureError,
  onSave,
  shopContent,
}: HomeSceneProps) => {
  const sceneRef = useRef<HTMLFieldSetElement>(null);
  const shopTriggerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    placement: HomePlacement;
    clientX: number;
    clientY: number;
    pointerId: number;
  } | null>(null);
  const [failedHomeType, setFailedHomeType] = useState<HomeType | null>(null);
  const [draft, setDraft] = useState<HomeDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const placements = draft?.placements ?? layout;
  const furnitureById = new Map(furniture.map((piece) => [piece.id, piece]));
  const selectedFurniture = selectedId ? furnitureById.get(selectedId) : undefined;
  const selected = selectedFurniture
    ? placements.find((placement) => placement.id === selectedId)
    : undefined;
  const isEditing = draft !== null;
  const hasImageError = failedHomeType === homeType;
  const sleepLabel = isTogglingSleep
    ? "Please wait…"
    : isAsleep
      ? "Wake up"
      : "Go to sleep";
  const isTierChanged = draft !== null && draft.homeType !== homeType;
  const hasMissingFurniture =
    isEditing && placements.some((placement) => !furnitureById.has(placement.id));
  const isMovementDisabled = isSaving || isTierChanged || !canDecorate;
  const hasPlacementLimit = placements.length >= HOME_FURNITURE_MAX_PLACEMENTS;

  /** End the current drag before loading the saved layout's home tier and revision. */
  const loadSavedLayout = () => {
    dragRef.current = null;
    setSelectedId(
      layout.find((placement) => furnitureById.has(placement.id))?.id ??
        furniture[0]?.id ??
        null,
    );
    setDraft({
      homeType,
      revision,
      placements: layout.map((placement) => ({ ...placement })),
    });
  };

  /** Change the active draft's placements while preserving its home tier and revision. */
  const updatePlacements = (
    transform: (placements: HomePlacement[]) => HomePlacement[],
  ) => {
    if (isMovementDisabled) return;
    setDraft(
      (current) =>
        current && {
          ...current,
          placements: transform(current.placements),
        },
    );
  };

  /** Apply the shared floor bounds to pointer, keyboard, toolbar, and cancellation movement. */
  const moveFurniture = (id: string, x: number, y: number) => {
    updatePlacements((placements) =>
      placements.map((placement) =>
        placement.id === id
          ? { ...placement, x: clampPosition(x), y: clampPosition(y) }
          : placement,
      ),
    );
  };

  /** Finish only the active drag, restoring its original position on cancellation. */
  const finishDrag = (id: string, pointerId: number, shouldRestoreOrigin = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId || drag.placement.id !== id) return;
    if (shouldRestoreOrigin) moveFurniture(id, drag.placement.x, drag.placement.y);
    dragRef.current = null;
  };

  /** Select an owned instance, reusing its placement or placing it at the floor's center. */
  const selectFurniture = (id: string) => {
    setSelectedId(id);
    updatePlacements((placements) =>
      placements.some((placement) => placement.id === id) ||
      placements.length >= HOME_FURNITURE_MAX_PLACEMENTS
        ? placements
        : [...placements, { id, x: 50, y: 50, rotation: 0 }],
    );
  };

  /** Retain a rejected draft and leave the editor only after its snapshot is accepted. */
  const saveLayout = async () => {
    if (!draft || !onSave || isMovementDisabled || hasMissingFurniture) return;
    // End the drag so captured events cannot move the draft away from its submitted snapshot.
    dragRef.current = null;
    // Keep the exact editing revision: a stale tab must not overwrite another saved layout.
    if (await onSave(draft)) setDraft(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-muted-foreground text-xs">
          {isEditing
            ? "Arrange your furniture, then save your layout."
            : "Select an object to use your home."}
        </p>
        <div className="flex shrink-0 gap-1">
          {canDecorate && !isEditing && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                aria-label="Decorate"
                hoverText="Decorate"
                disabled={isRefreshingFurniture}
                onClick={loadSavedLayout}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                aria-label="House shop"
                hoverText="House shop"
                ref={shopTriggerRef}
                onClick={() => setIsShopOpen(true)}
              >
                <ShoppingBag className="h-4 w-4" aria-hidden />
              </Button>
            </>
          )}
          {!isGuest && (
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              aria-label="Manage home"
              hoverText="Manage home"
              disabled={isEditing}
              onClick={(event) => onManage(event.currentTarget)}
            >
              <House className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      <fieldset
        ref={sceneRef}
        aria-label="Home scene"
        className="relative mx-auto aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-lg border border-stone-700/40 bg-[#24211c] shadow-md"
      >
        {!hasImageError && (
          <picture className="pointer-events-none absolute inset-0">
            {/* Next images are unoptimized; the browser selects a Bunny rendition for its viewport and pixel density. */}
            <source
              srcSet={[480, 768, 1024, 1448]
                .map(
                  (width) =>
                    `${bunnyImageUrl(HOME_SCENE_IMAGES[homeType], width)} ${width}w`,
                )
                .join(", ")}
              sizes="(max-width: 768px) 100vw, 768px"
            />
            <Image
              src={bunnyImageUrl(HOME_SCENE_IMAGES[homeType], 768)}
              alt={`${HomeTypeDetails[homeType].name} interior`}
              fill
              className="pointer-events-none object-contain"
              loading="eager"
              fetchPriority="high"
              onError={() => setFailedHomeType(homeType)}
            />
          </picture>
        )}
        {hasImageError && (
          <p
            role="status"
            className="absolute inset-x-4 top-4 text-center text-sm text-white"
          >
            Home artwork is unavailable. Your furniture and text controls still work.
          </p>
        )}
        {isEditing && (
          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-slate-950/85 px-3 py-1 font-semibold text-amber-200 text-xs">
            Decorating · unsaved
          </span>
        )}
        {placements.map((placement) => {
          const details = furnitureById.get(placement.id);
          // Inventory can change while a draft is open; keep its edits without rendering missing pieces.
          if (!details) return null;
          const isSelected = isEditing && selectedId === placement.id;
          const x =
            HOME_FLOOR_PROJECTION.x + placement.x * HOME_FLOOR_PROJECTION.scaleX;
          const y =
            HOME_FLOOR_PROJECTION.y + placement.y * HOME_FLOOR_PROJECTION.scaleY;
          const label = isEditing
            ? `Move ${details.name}`
            : details.action === "sleep"
              ? `${details.name}: ${sleepLabel}`
              : details.action === "storage"
                ? isGuest
                  ? `${details.name}: Home storage is in your own village`
                  : `${details.name}: Open home storage`
                : details.action === "kitchen"
                  ? `${details.name}: Visit ramen shop`
                  : details.action === "farm"
                    ? `${details.name}: Open farm`
                    : details.name;
          const image = (
            <>
              <FurnitureImage
                furniture={details}
                rotation={placement.rotation}
                isGroundAnchored
              />
              {details.action && !isEditing && (
                <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/85 px-2 py-1 text-white text-xs opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {details.name}
                  {details.action === "sleep" && isAsleep ? " · asleep" : ""}
                </span>
              )}
            </>
          );
          const className = cn(
            "group absolute min-h-11 min-w-11 -translate-x-1/2 -translate-y-full cursor-pointer rounded-lg border-2 border-transparent outline-none focus-visible:border-white",
            isEditing
              ? "cursor-grab touch-none active:cursor-grabbing"
              : "transition-[filter] hover:brightness-125",
            isSelected && "border-amber-300 bg-amber-300/10",
            "disabled:cursor-not-allowed disabled:opacity-60",
          );
          const style = {
            left: `${x}%`,
            top: `${y}%`,
            width: `${details.width}%`,
            zIndex: details.isFloor ? 1 : Math.round(y) + 2,
          };
          if (!isEditing && !details.action)
            return (
              <div
                key={placement.id}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
                style={style}
              >
                {image}
              </div>
            );
          if (!isEditing && details.action === "kitchen")
            return (
              <Link
                key={placement.id}
                href="/ramenshop"
                aria-label={label}
                className={className}
                style={style}
              >
                {image}
              </Link>
            );
          return (
            <button
              key={placement.id}
              type="button"
              aria-label={label}
              aria-pressed={isEditing ? isSelected : undefined}
              disabled={
                (isEditing && isMovementDisabled) ||
                (!isEditing &&
                  ((details.action === "storage" && isGuest) ||
                    (details.action === "sleep" && isTogglingSleep)))
              }
              className={className}
              style={style}
              onClick={(event) => {
                if (isEditing) setSelectedId(placement.id);
                else if (details.action === "sleep") onSleep();
                else if (details.action === "storage") onStorage(event.currentTarget);
                else if (details.action === "farm") onFarm(event.currentTarget);
              }}
              onPointerDown={(event) => {
                if (
                  !isEditing ||
                  isMovementDisabled ||
                  event.button !== 0 ||
                  dragRef.current
                )
                  return;
                setSelectedId(placement.id);
                dragRef.current = {
                  placement,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  pointerId: event.pointerId,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                const bounds = sceneRef.current?.getBoundingClientRect();
                if (
                  isMovementDisabled ||
                  !drag ||
                  drag.pointerId !== event.pointerId ||
                  drag.placement.id !== placement.id ||
                  !bounds
                )
                  return;
                // Scale each viewport axis separately to match the room camera projection.
                const dx = ((event.clientX - drag.clientX) / bounds.width) * 100;
                const dy = ((event.clientY - drag.clientY) / bounds.height) * 100;
                moveFurniture(
                  placement.id,
                  drag.placement.x + dx / HOME_FLOOR_PROJECTION.scaleX,
                  drag.placement.y + dy / HOME_FLOOR_PROJECTION.scaleY,
                );
              }}
              onPointerUp={(event) => finishDrag(placement.id, event.pointerId)}
              onPointerCancel={(event) =>
                finishDrag(placement.id, event.pointerId, true)
              }
              onLostPointerCapture={(event) =>
                finishDrag(placement.id, event.pointerId)
              }
              onKeyDown={(event) => {
                if (!isEditing || isMovementDisabled) return;
                const direction = FURNITURE_DIRECTIONS.find(
                  (direction) => direction.key === event.key,
                );
                if (!direction) return;
                event.preventDefault();
                setSelectedId(placement.id);
                moveFurniture(
                  placement.id,
                  placement.x + direction.dx,
                  placement.y + direction.dy,
                );
              }}
            >
              {image}
            </button>
          );
        })}
      </fieldset>
      {!isEditing &&
        canDecorate &&
        !placements.some((placement) => furnitureById.has(placement.id)) && (
          <p className="text-center text-muted-foreground text-sm">
            Your room is empty. Open Decorate to place owned furniture, or visit the
            house shop.
          </p>
        )}
      {isEditing && (
        <div className="space-y-3 rounded-xl border bg-muted/40 p-3">
          <div className="space-y-2">
            <div>
              <p className="font-semibold">
                {selectedFurniture?.name ?? "Choose furniture"}
              </p>
              {selectedFurniture && (
                <p className="text-muted-foreground text-sm">
                  {selectedFurniture.description}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Drag an object or use the arrows. Flip mirrors it horizontally.
              </p>
            </div>
            {selected && selectedFurniture && (
              <fieldset
                aria-label="Furniture controls"
                className="grid w-full min-w-0 max-w-xs grid-cols-6 gap-1"
              >
                {FURNITURE_DIRECTIONS.map(({ icon: Icon, label, dx, dy }) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="icon"
                    className="h-11 w-full min-w-0"
                    disabled={isMovementDisabled}
                    aria-label={`Move ${selectedFurniture.name} ${label}`}
                    hoverText={`Move ${label}`}
                    onClick={() =>
                      moveFurniture(selected.id, selected.x + dx, selected.y + dy)
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-full min-w-0"
                  aria-label="Flip horizontally"
                  hoverText="Flip horizontally"
                  disabled={isMovementDisabled}
                  onClick={() =>
                    updatePlacements((placements) =>
                      placements.map((placement) =>
                        placement.id === selectedId
                          ? {
                              ...placement,
                              rotation: placement.rotation === 0 ? 1 : 0,
                            }
                          : placement,
                      ),
                    )
                  }
                >
                  <FlipHorizontal className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-full min-w-0"
                  aria-label="Store"
                  hoverText="Store in inventory"
                  disabled={isMovementDisabled}
                  onClick={() => {
                    dragRef.current = null;
                    updatePlacements((placements) =>
                      placements.filter((placement) => placement.id !== selectedId),
                    );
                  }}
                >
                  <Package className="h-4 w-4" aria-hidden />
                </Button>
              </fieldset>
            )}
          </div>
          <fieldset
            aria-label="Owned furniture"
            className="flex min-w-0 gap-2 overflow-x-auto pb-2"
          >
            {furniture.map((piece) => {
              const copies = furniture.filter((other) => other.itemId === piece.itemId);
              const isPlaced = placements.some(
                (placement) => placement.id === piece.id,
              );
              return (
                <button
                  key={piece.id}
                  type="button"
                  aria-pressed={selectedId === piece.id}
                  disabled={isMovementDisabled || (hasPlacementLimit && !isPlaced)}
                  className={cn(
                    "flex w-24 shrink-0 flex-col rounded-lg border bg-background p-2 text-xs focus-visible:outline-2 focus-visible:outline-primary",
                    selectedId === piece.id && "border-primary ring-1 ring-primary",
                  )}
                  onClick={() => selectFurniture(piece.id)}
                >
                  <div className="aspect-[4/3] w-full">
                    <FurnitureImage furniture={piece} rotation={0} />
                  </div>
                  <span className="line-clamp-2 min-h-8">{piece.name}</span>
                  {copies.length > 1 && (
                    <span className="block text-muted-foreground">
                      Copy {copies.findIndex((other) => other.id === piece.id) + 1} of{" "}
                      {copies.length}
                    </span>
                  )}
                  {piece.quantity > 1 && (
                    <span className="block text-muted-foreground">
                      Quantity: {piece.quantity}
                    </span>
                  )}
                  <span className="mt-auto block pt-1 text-muted-foreground">
                    {isPlaced ? "Placed" : "In inventory · Place"}
                  </span>
                </button>
              );
            })}
            {furniture.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Your furniture inventory is empty. Visit the house shop to find a piece.
              </p>
            )}
          </fieldset>
          {hasPlacementLimit && (
            <p role="status" className="text-muted-foreground text-sm">
              Your home can display up to {HOME_FURNITURE_MAX_PLACEMENTS} pieces of
              furniture. Store a placed piece to make room.
            </p>
          )}
          {isTierChanged && (
            <p role="alert" className="text-destructive text-sm">
              Your home tier changed. Cancel and reopen the editor for this home.
            </p>
          )}
          {hasMissingFurniture && (
            <p role="alert" className="text-destructive text-sm">
              Some furniture is no longer in your inventory. Reload saved layout to
              continue.
            </p>
          )}
          {furnitureError && (
            <p role="alert" className="text-destructive text-sm">
              {furnitureError}
            </p>
          )}
          <div className="grid grid-cols-[1fr_auto_2.75rem_2.75rem] gap-1 sm:gap-2">
            <Button
              className="h-11 min-w-0 px-3"
              aria-label={isSaving ? "Saving layout" : "Save layout"}
              onClick={() => void saveLayout()}
              disabled={isMovementDisabled || hasMissingFurniture}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden />
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outline"
              className="h-11 px-3"
              disabled={isSaving}
              onClick={() => {
                dragRef.current = null;
                setDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              aria-label="Reload saved layout"
              hoverText="Reload saved layout"
              disabled={isSaving}
              onClick={loadSavedLayout}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label="Reset arrangement"
              hoverText="Reset arrangement"
              disabled={isSaving}
              onClick={() => {
                dragRef.current = null;
                updatePlacements(() => getDefaultHomeLayout(furniture));
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Your arrangement follows home upgrades. Unplaced furniture stays in your
            inventory. Home actions are available through the text controls.
          </p>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-center text-sm">
        {isTogglingSleep
          ? "Changing sleep status…"
          : isAsleep
            ? "You are asleep. Resting restores your energy."
            : "You are awake."}
      </p>
      {!isEditing && (
        <fieldset
          aria-label="Home actions"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <Button
            variant="ghost"
            onClick={onSleep}
            disabled={isTogglingSleep}
            className="h-11 px-2"
          >
            <BedDouble className="mr-2 h-4 w-4" aria-hidden />
            {sleepLabel}
          </Button>
          <Button
            variant="ghost"
            onClick={(event) => onStorage(event.currentTarget)}
            disabled={isGuest}
            className="h-11 px-2"
          >
            <Package className="mr-2 h-4 w-4" aria-hidden />
            Home storage
          </Button>
          <Button variant="ghost" asChild className="h-11 px-2">
            <Link href="/ramenshop">
              <ChefHat className="mr-2 h-4 w-4" aria-hidden />
              Kitchen
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={(event) => onFarm(event.currentTarget)}
            className="h-11 px-2"
          >
            <Sprout className="mr-2 h-4 w-4" aria-hidden />
            Farm
          </Button>
        </fieldset>
      )}
      <p className="text-muted-foreground text-xs">
        Kitchen serves ramen while cooking is being prepared.
      </p>
      <Modal
        title="House Shop"
        isOpen={isShopOpen}
        setIsOpen={setIsShopOpen}
        returnFocusRef={shopTriggerRef}
        className="sm:max-w-2xl"
      >
        <p className="text-muted-foreground text-sm">
          Purchases go into your home storage. Place furniture with the home editor.
        </p>
        {isShopOpen && shopContent}
      </Modal>
    </div>
  );
};

/** Align visible ground despite transparent padding; previews retain the complete sprite frame. */
const FurnitureImage = ({
  furniture,
  rotation,
  isGroundAnchored = false,
}: {
  furniture: HomeFurniture;
  rotation: 0 | 1;
  isGroundAnchored?: boolean;
}) => {
  const groundOffset = isGroundAnchored ? 100 - furniture.groundAnchor : 0;
  return (
    <picture>
      <source
        srcSet={[128, 256, 400, 768]
          .map((width) => `${bunnyImageUrl(furniture.image, width)} ${width}w`)
          .join(", ")}
        sizes={
          isGroundAnchored
            ? `(max-width: 768px) ${furniture.width}vw, ${Math.round(furniture.width * 7.68)}px`
            : "80px"
        }
      />
      <Image
        src={furniture.image}
        alt=""
        width={400}
        height={300}
        className="pointer-events-none h-auto w-full select-none object-contain"
        style={{
          transform: `translateY(${groundOffset}%) scaleX(${rotation === 1 ? -1 : 1})`,
        }}
        draggable={false}
      />
    </picture>
  );
};

/**
 * Every room uses the same overhead camera. Its inset floor leaves room for walls
 * and reachable furniture edges. Its placement plane extends into the front yard,
 * so furniture can sit indoors or outside.
 * These screen percentages preserve normalized saved placements across home tiers.
 */
const HOME_FLOOR_PROJECTION = {
  x: 18,
  y: 30,
  scaleX: 0.64,
  scaleY: 0.66,
} as const;

/** Keep a furniture anchor inside the usable floor, including keyboard and cancelled drags. */
const clampPosition = (value: number) =>
  Math.max(
    HOME_FURNITURE_POSITION_MIN,
    Math.min(HOME_FURNITURE_POSITION_MAX, Math.round(value * 100) / 100),
  );

/** Keyboard and toolbar movement follow the overhead camera's horizontal and vertical axes. */
const FURNITURE_DIRECTIONS = [
  { key: "ArrowLeft", icon: ArrowLeft, label: "left", dx: -2, dy: 0 },
  { key: "ArrowUp", icon: ArrowUp, label: "up", dx: 0, dy: -2 },
  { key: "ArrowDown", icon: ArrowDown, label: "down", dx: 0, dy: 2 },
  { key: "ArrowRight", icon: ArrowRight, label: "right", dx: 2, dy: 0 },
] as const;

/** Unfurnished room shells share the editor's overhead floor projection. */
export const HOME_SCENE_IMAGES = {
  NONE: "https://ui0arpl8sm.ufs.sh/f/Wn3b08fT6eLPpAlBHGmOT.webp",
  STUDIO_APARTMENT: "https://ui0arpl8sm.ufs.sh/f/f4UiNvK2MUR1t4jryeYVP.webp",
  ONE_BED_APARTMENT: "https://ui0arpl8sm.ufs.sh/f/9hq1imSs_I40NmFQhl6sV.webp",
  TWO_BED_HOUSE: "https://ui0arpl8sm.ufs.sh/f/tWAQ50J2WaslX7Cgo2kKI.webp",
  TOWN_HOUSE: "https://ui0arpl8sm.ufs.sh/f/bLmh_Na-sWSSS3xJKKssa.webp",
  SMALL_MANSION: "https://ui0arpl8sm.ufs.sh/f/Pet3rpFBBOgHMOgSfRjoe.webp",
  SMALL_ESTATE: "https://ui0arpl8sm.ufs.sh/f/wQN5IE2zpgd2-C1n8Y0Mg.webp",
  LARGE_ESTATE: "https://ui0arpl8sm.ufs.sh/f/5IN8T8Hd4oR8J2vtBciPj.webp",
  PALACE: "https://ui0arpl8sm.ufs.sh/f/WDu6t6mmPUhMf-md-xPio.webp",
  MARSHMALLOWOPOLIS: "https://ui0arpl8sm.ufs.sh/f/IYFSPADWRNvdav7MrmsFO.webp",
} satisfies Record<HomeType, string>;

type HomeDraft = { homeType: HomeType; revision: number; placements: HomePlacement[] };

/** Existing game actions and server-owned furniture state; draft edits never grant ownership. */
type HomeSceneProps = {
  homeType: HomeType;
  isGuest: boolean;
  isAsleep: boolean;
  isTogglingSleep: boolean;
  onSleep: () => void;
  onStorage: (trigger: HTMLButtonElement) => void;
  onManage: (trigger: HTMLButtonElement) => void;
  onFarm: (trigger: HTMLButtonElement) => void;
  layout?: HomePlacement[];
  furniture?: HomeFurniture[];
  revision?: number;
  canDecorate?: boolean;
  isSaving?: boolean;
  isRefreshingFurniture?: boolean;
  furnitureError?: string | null;
  /** Return success only after the guarded server save; rejection preserves the draft. */
  onSave?: (draft: HomeDraft) => Promise<boolean>;
  shopContent?: ReactNode;
};
