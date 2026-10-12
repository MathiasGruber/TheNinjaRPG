"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BedDouble,
  ChefHat,
  House,
  Package,
  Pencil,
  RotateCcw,
  Save,
  ShoppingBag,
  Sprout,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HOME_FURNITURE_POSITION_MAX,
  HOME_FURNITURE_POSITION_MIN,
  HomeFurnitureCoreIds,
  HomeFurnitureDetails,
  type HomeFurnitureId,
  HomeFurniturePurchaseIds,
  type HomeType,
  HomeTypeDetails,
} from "@/drizzle/constants";
import Image from "@/layout/Image";
import Link from "@/layout/Link";
import Modal from "@/layout/Modal";
import { getDefaultHomeLayout } from "@/libs/home";
import { cn } from "@/libs/shadui";
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
  layout = getDefaultHomeLayout(),
  owned = [],
  revision = 0,
  canDecorate = false,
  money = 0,
  isSaving = false,
  isBuying = false,
  furnitureError,
  onSave,
  onPurchase,
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
  const [selectedId, setSelectedId] = useState<HomeFurnitureId>("bed");
  const [isShopOpen, setIsShopOpen] = useState(false);
  const placements = draft?.placements ?? layout;
  const selected = placements.find((placement) => placement.id === selectedId);
  const isEditing = draft !== null;
  const hasImageError = failedHomeType === homeType;
  const sleepLabel = isTogglingSleep
    ? "Please wait…"
    : isAsleep
      ? "Wake up"
      : "Go to sleep";
  const isTierChanged = draft !== null && draft.homeType !== homeType;

  /** End the current drag before loading the saved layout's home tier and revision. */
  const loadSavedLayout = () => {
    dragRef.current = null;
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
    setDraft(
      (current) =>
        current && {
          ...current,
          placements: transform(current.placements),
        },
    );
  };

  /** Apply the shared floor bounds to pointer, keyboard, toolbar, and cancellation movement. */
  const moveFurniture = (id: HomeFurnitureId, x: number, y: number) => {
    updatePlacements((placements) =>
      placements.map((placement) =>
        placement.id === id
          ? { ...placement, x: clampPosition(x), y: clampPosition(y) }
          : placement,
      ),
    );
  };

  /** Finish only the active drag, restoring its original position on cancellation. */
  const finishDrag = (
    id: HomeFurnitureId,
    pointerId: number,
    shouldRestoreOrigin = false,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId || drag.placement.id !== id) return;
    if (shouldRestoreOrigin) moveFurniture(id, drag.placement.x, drag.placement.y);
    dragRef.current = null;
  };

  /** Select an owned instance, reusing its placement or placing it at the floor's center. */
  const selectFurniture = (id: HomeFurnitureId) => {
    setSelectedId(id);
    updatePlacements((placements) =>
      placements.some((placement) => placement.id === id)
        ? placements
        : [...placements, { id, x: 50, y: 50, rotation: 0 }],
    );
  };

  /** Retain a rejected draft and leave the editor only after its snapshot is accepted. */
  const saveLayout = async () => {
    if (!draft || !onSave || isSaving || isTierChanged) return;
    // End the drag so captured events cannot move the draft away from its submitted snapshot.
    dragRef.current = null;
    // Keep the exact editing revision: a stale tab must not overwrite another saved layout.
    if (await onSave(draft)) setDraft(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {isGuest ? "Guest residence" : HomeTypeDetails[homeType].name}
          </p>
          <p className="text-muted-foreground text-xs">
            {isEditing
              ? "Arrange your furniture, then save your layout."
              : "Select an object to use your home."}
          </p>
        </div>
        {canDecorate && !isEditing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={isBuying}
              onClick={() => {
                loadSavedLayout();
                setSelectedId("bed");
              }}
            >
              <Pencil className="mr-2 h-4 w-4" aria-hidden /> Decorate
            </Button>
            <Button
              variant="outline"
              ref={shopTriggerRef}
              disabled={isBuying}
              onClick={() => setIsShopOpen(true)}
            >
              <ShoppingBag className="mr-2 h-4 w-4" aria-hidden /> House shop
            </Button>
          </div>
        )}
      </div>
      <fieldset
        ref={sceneRef}
        aria-label="Home scene"
        className="relative mx-auto aspect-square w-full max-w-3xl overflow-hidden rounded-xl border bg-[#272f30]"
      >
        {!hasImageError && (
          <Image
            src={HOME_SCENE_IMAGES[homeType]}
            alt={`${HomeTypeDetails[homeType].name} interior`}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="pointer-events-none object-contain"
            preload
            onError={() => setFailedHomeType(homeType)}
          />
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
          const details = HomeFurnitureDetails[placement.id];
          const isSelected = isEditing && selectedId === placement.id;
          const x = 50 + (placement.x - placement.y) * 0.44;
          const y = 28 + (placement.x + placement.y) * 0.22;
          const label = isEditing
            ? `Move ${details.name}`
            : placement.id === "bed"
              ? `Bed: ${sleepLabel}`
              : placement.id === "armory"
                ? isGuest
                  ? "Armory: Home storage is in your own village"
                  : "Armory: Open home storage"
                : placement.id === "kitchen"
                  ? "Kitchen: Visit ramen shop"
                  : placement.id === "garden"
                    ? "Garden: Open farm"
                    : details.name;
          const image = (
            <>
              <FurnitureImage id={placement.id} rotation={placement.rotation} />
              {details.action && !isEditing && (
                <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/85 px-2 py-1 text-white text-xs shadow-sm">
                  {details.name}
                  {placement.id === "bed" && isAsleep ? " · asleep" : ""}
                </span>
              )}
            </>
          );
          const className = cn(
            "absolute min-h-11 min-w-11 -translate-x-1/2 -translate-y-full cursor-pointer rounded-lg border-2 border-transparent outline-none focus-visible:border-white",
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
            zIndex: placement.id === "rug" ? 1 : Math.round(y) + 2,
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
          if (!isEditing && placement.id === "kitchen")
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
                isSaving ||
                (!isEditing &&
                  ((placement.id === "armory" && isGuest) ||
                    (placement.id === "bed" && isTogglingSleep)))
              }
              className={className}
              style={style}
              onClick={(event) => {
                if (isEditing) setSelectedId(placement.id);
                else if (placement.id === "bed") onSleep();
                else if (placement.id === "armory") onStorage(event.currentTarget);
                else if (placement.id === "garden") onFarm(event.currentTarget);
              }}
              onPointerDown={(event) => {
                if (
                  !isEditing ||
                  !canDecorate ||
                  isSaving ||
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
                  !drag ||
                  drag.pointerId !== event.pointerId ||
                  drag.placement.id !== placement.id ||
                  !bounds
                )
                  return;
                // Invert the shared floor projection; percentages keep a layout stable at any viewport size.
                const dx = ((event.clientX - drag.clientX) / bounds.width) * 100;
                const dy = ((event.clientY - drag.clientY) / bounds.height) * 100;
                moveFurniture(
                  placement.id,
                  drag.placement.x + dx / 0.88 + dy / 0.44,
                  drag.placement.y - dx / 0.88 + dy / 0.44,
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
                if (!isEditing || isSaving) return;
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
      {isEditing && (
        <div className="space-y-3 rounded-xl border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{HomeFurnitureDetails[selectedId].name}</p>
              <p className="text-muted-foreground text-xs">
                Drag an object or use the arrows. Rotate changes its facing.
              </p>
            </div>
            {selected && (
              <div className="flex flex-wrap gap-1">
                {FURNITURE_DIRECTIONS.map(({ icon: Icon, label, dx, dy }) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    disabled={isSaving}
                    aria-label={`Move ${HomeFurnitureDetails[selectedId].name} ${label}`}
                    onClick={() =>
                      moveFurniture(selectedId, selected.x + dx, selected.y + dy)
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </Button>
                ))}
                <Button
                  variant="outline"
                  disabled={isSaving}
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
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Rotate
                </Button>
                {!HomeFurnitureCoreIds.includes(
                  selectedId as (typeof HomeFurnitureCoreIds)[number],
                ) && (
                  <Button
                    variant="outline"
                    disabled={isSaving}
                    onClick={() =>
                      updatePlacements((placements) =>
                        placements.filter((placement) => placement.id !== selectedId),
                      )
                    }
                  >
                    <Package className="mr-2 h-4 w-4" aria-hidden /> Store
                  </Button>
                )}
              </div>
            )}
          </div>
          <fieldset
            aria-label="Owned furniture"
            className="flex gap-2 overflow-x-auto pb-2"
          >
            {[...HomeFurnitureCoreIds, ...owned].map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={selectedId === id}
                disabled={isSaving}
                className={cn(
                  "w-24 shrink-0 rounded-lg border bg-background p-2 text-xs focus-visible:outline-2 focus-visible:outline-primary",
                  selectedId === id && "border-primary ring-1 ring-primary",
                )}
                onClick={() => selectFurniture(id)}
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <div className="absolute inset-x-0 bottom-0">
                    <FurnitureImage id={id} rotation={0} />
                  </div>
                </div>
                <span>{HomeFurnitureDetails[id].name}</span>
                <span className="block text-muted-foreground">
                  {placements.some((placement) => placement.id === id)
                    ? "Placed"
                    : "In storage · Place"}
                </span>
              </button>
            ))}
          </fieldset>
          {isTierChanged && (
            <p role="alert" className="text-destructive text-sm">
              Your home tier changed. Cancel and reopen the editor for this home.
            </p>
          )}
          {furnitureError && (
            <p role="alert" className="text-destructive text-sm">
              {furnitureError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void saveLayout()}
              disabled={isSaving || isTierChanged}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden />
              {isSaving ? "Saving…" : "Save layout"}
            </Button>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                dragRef.current = null;
                setDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="outline" disabled={isSaving} onClick={loadSavedLayout}>
              Reload saved layout
            </Button>
            <Button
              variant="ghost"
              disabled={isSaving}
              onClick={() => {
                dragRef.current = null;
                updatePlacements(getDefaultHomeLayout);
              }}
            >
              Reset arrangement
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Each home tier keeps its own layout. Unplaced decorations stay in furniture
            storage. Essential furniture always remains available.
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
            variant="outline"
            onClick={onSleep}
            disabled={isTogglingSleep}
            className="min-h-11"
          >
            <BedDouble className="mr-2 h-4 w-4" aria-hidden />
            {sleepLabel}
          </Button>
          <Button
            variant="outline"
            onClick={(event) => onStorage(event.currentTarget)}
            disabled={isGuest}
            className="min-h-11"
          >
            <Package className="mr-2 h-4 w-4" aria-hidden />
            Home storage
          </Button>
          <Button variant="outline" asChild className="min-h-11">
            <Link href="/ramenshop">
              <ChefHat className="mr-2 h-4 w-4" aria-hidden />
              Kitchen
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={(event) => onFarm(event.currentTarget)}
            className="min-h-11"
          >
            <Sprout className="mr-2 h-4 w-4" aria-hidden />
            Farm
          </Button>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-sm">
        <span>Kitchen serves ramen while cooking is being prepared.</span>
        {!isGuest && (
          <Button
            variant="outline"
            disabled={isEditing}
            onClick={(event) => onManage(event.currentTarget)}
            className="min-h-11"
          >
            <House className="mr-2 h-4 w-4" aria-hidden />
            Manage home
          </Button>
        )}
      </div>
      <Modal
        title="House Shop"
        isOpen={isShopOpen}
        setIsOpen={setIsShopOpen}
        returnFocusRef={shopTriggerRef}
        className="sm:max-w-2xl"
      >
        <p className="text-muted-foreground text-sm">
          Decorate your home. Furniture changes its appearance without adding gameplay
          bonuses. Purchases go into furniture storage.
        </p>
        <p className="font-semibold">{money.toLocaleString()} Ryo</p>
        {furnitureError && (
          <p role="alert" className="text-destructive text-sm">
            {furnitureError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {HomeFurniturePurchaseIds.map((id) => {
            const details = HomeFurnitureDetails[id];
            const isOwned = owned.includes(id);
            return (
              <div
                key={id}
                className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <div className="absolute inset-x-0 bottom-0">
                    <FurnitureImage id={id} rotation={0} />
                  </div>
                </div>
                <p className="font-semibold text-sm">{details.name}</p>
                <p className="grow text-muted-foreground text-xs">
                  {details.description}
                </p>
                <p className="text-sm">{details.price.toLocaleString()} Ryo</p>
                <Button
                  size="sm"
                  className="h-auto min-h-11 whitespace-normal"
                  aria-label={isOwned ? `${details.name} owned` : `Buy ${details.name}`}
                  disabled={isOwned || isBuying || money < details.price}
                  onClick={() => void onPurchase?.(id)}
                >
                  {isOwned
                    ? "Owned"
                    : isBuying
                      ? "Please wait…"
                      : money < details.price
                        ? "Not enough Ryo"
                        : "Buy"}
                </Button>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
};

/** Transparent sprites use a bottom-center ground anchor and mirror to change facing. */
const FurnitureImage = ({ id, rotation }: { id: HomeFurnitureId; rotation: 0 | 1 }) => (
  <Image
    src={HomeFurnitureDetails[id].image}
    alt=""
    width={400}
    height={400}
    className="pointer-events-none h-auto w-full select-none"
    style={{ transform: rotation === 1 ? "scaleX(-1)" : undefined }}
    draggable={false}
  />
);

/** Keep a furniture anchor inside the usable floor, including keyboard and cancelled drags. */
const clampPosition = (value: number) =>
  Math.max(
    HOME_FURNITURE_POSITION_MIN,
    Math.min(HOME_FURNITURE_POSITION_MAX, Math.round(value * 100) / 100),
  );

/** Keyboard and toolbar movement use the same isometric floor offsets. */
const FURNITURE_DIRECTIONS = [
  { key: "ArrowLeft", icon: ArrowLeft, label: "left", dx: -2, dy: 2 },
  { key: "ArrowUp", icon: ArrowUp, label: "up", dx: -2, dy: -2 },
  { key: "ArrowDown", icon: ArrowDown, label: "down", dx: 2, dy: 2 },
  { key: "ArrowRight", icon: ArrowRight, label: "right", dx: 2, dy: -2 },
] as const;

/** Unfurnished original room shells share the editor's isometric floor projection. */
export const HOME_SCENE_IMAGES = {
  NONE: "/images/home/tent.svg",
  STUDIO_APARTMENT: "/images/home/studio-apartment.svg",
  ONE_BED_APARTMENT: "/images/home/one-bed-apartment.svg",
  TWO_BED_HOUSE: "/images/home/two-bed-house.svg",
  TOWN_HOUSE: "/images/home/town-house.svg",
  SMALL_MANSION: "/images/home/small-mansion.svg",
  SMALL_ESTATE: "/images/home/small-estate.svg",
  LARGE_ESTATE: "/images/home/large-estate.svg",
  PALACE: "/images/home/palace.svg",
  MARSHMALLOWOPOLIS: "/images/home/marshmallowopolis.svg",
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
  owned?: HomeFurnitureId[];
  revision?: number;
  canDecorate?: boolean;
  money?: number;
  isSaving?: boolean;
  isBuying?: boolean;
  furnitureError?: string | null;
  /** Return success only after the guarded server save; rejection preserves the draft. */
  onSave?: (draft: HomeDraft) => Promise<boolean>;
  onPurchase?: (id: (typeof HomeFurniturePurchaseIds)[number]) => Promise<void>;
};
