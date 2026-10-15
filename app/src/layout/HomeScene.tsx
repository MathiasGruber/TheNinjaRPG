"use client";

import {
  BedDouble,
  ChefHat,
  Package,
  RotateCcw,
  RotateCw,
  Save,
  Sprout,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HOME_FLOOR_TILES,
  HOME_FURNITURE_MAX_PLACEMENTS,
  HOME_FURNITURE_ROTATION_DEGREES,
  HOME_WALL_PAINTS,
  type HomeFurnitureRotation,
  type HomeType,
  HomeTypeDetails,
} from "@/drizzle/constants";
import { HomePropertyBackdrop } from "@/layout/HomePropertyBackdrop";
import Image from "@/layout/Image";
import {
  fitHomeFurniturePlacement,
  getHomeFurnitureGeometry,
  getHomeFurnitureRotations,
  getHomeFurnitureView,
  type HomeFurniture,
  homeLayoutEssentialsError,
  projectHomePlacement,
  recoverHomeLayout,
  unprojectHomePlacement,
} from "@/libs/home";
import {
  boundHomeCamera,
  getHomePlacementRoom,
  getHomeRooms,
  type HomeRoomId,
  zoomHomeCamera,
} from "@/libs/homeProperty";
import { HOME_ROOM_GEOMETRY } from "@/libs/homeRoomGeometry";
import { cn } from "@/libs/shadui";
import { bunnyImageUrl } from "@/utils/image";
import type { HomePlacement, HomeRoomStyle } from "@/validators/home";

/** A furnished residence with a reversible draft; the page owns persistence and game actions. */
export const HomeScene = ({
  homeType,
  isGuest,
  isAsleep,
  isTogglingSleep,
  onSleep,
  onStorage,
  onKitchen,
  onFarm,
  isDecorating,
  onDecoratingChange,
  layout = [],
  furniture = [],
  revision = 0,
  canDecorate = false,
  isSaving = false,
  isRefreshingFurniture = false,
  furnitureError,
  onSave,
  styles = [],
  isVisiting = false,
}: HomeSceneProps) => {
  const sceneRef = useRef<HTMLFieldSetElement>(null);
  const dragRef = useRef<{
    placement: HomePlacement;
    clientX: number;
    clientY: number;
    pointerId: number;
  } | null>(null);
  const foregroundId = useId();
  const rooms = getHomeRooms(homeType);
  const isProperty = rooms.length > 1;
  const [activeRoom, setActiveRoom] = useState<HomeRoomId>("main");
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const cameraPointers = useRef(new Map<number, { x: number; y: number }>());
  const focusRoom = (id: HomeRoomId) => {
    const room = rooms.find((room) => room.id === id) ?? {
      id: "main" as const,
      x: 0,
      y: 0,
    };
    setActiveRoom(room.id);
    setCamera({ x: -room.x, y: -room.y, scale: 1 });
  };
  const roomBounds = (piece: HomeFurniture, placement: HomePlacement) => {
    const room = rooms.find(({ id }) => id === getHomePlacementRoom(placement));
    const bounds = getHomeFurnitureGeometry(piece, placement).visibleBounds;
    return { ...bounds, x: bounds.x + (room?.x ?? 0), y: bounds.y + (room?.y ?? 0) };
  };
  useEffect(() => {
    setCamera({ x: 0, y: 0, scale: 1 });
    setActiveRoom("main");
  }, [homeType]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !isProperty) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setCamera((current) => {
        const scale = Math.max(
          0.3,
          Math.min(1.8, current.scale * (event.deltaY > 0 ? 0.9 : 1.1)),
        );
        const rect = scene.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        return boundHomeCamera(zoomHomeCamera(current, scale, { x, y }), homeType);
      });
    };
    scene.addEventListener("wheel", wheel, { passive: false });
    return () => scene.removeEventListener("wheel", wheel);
  }, [homeType, isProperty]);
  const [failedHomeType, setFailedHomeType] = useState<HomeType | null>(null);
  const [draft, setDraft] = useState<HomeDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [storageTargetId, setStorageTargetId] = useState<string | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const furnitureById = new Map(furniture.map((piece) => [piece.id, piece]));
  const placements =
    draft?.placements ?? recoverHomeLayout(layout, furniture, homeType);
  const selectedFurniture = selectedId ? furnitureById.get(selectedId) : undefined;
  const selected = placements.find((placement) => placement.id === selectedId);
  const isEditing = isDecorating && draft !== null;
  const isTierChanged = draft !== null && draft.homeType !== homeType;
  const hasMissingFurniture =
    isEditing && placements.some((placement) => !furnitureById.has(placement.id));
  const essentialsError = isEditing
    ? homeLayoutEssentialsError(placements, furniture)
    : null;
  const saveError = isTierChanged
    ? "Your home tier changed. Cancel and reopen the editor for this home."
    : hasMissingFurniture
      ? "Some furniture is no longer in your inventory. Undo changes to continue."
      : placementError || essentialsError || furnitureError;
  const isMovementDisabled = isSaving || isTierChanged || !canDecorate;
  const hasPlacementLimit =
    placements.filter((placement) => getHomePlacementRoom(placement) === activeRoom)
      .length >= HOME_FURNITURE_MAX_PLACEMENTS;
  const hasImageError = failedHomeType === homeType;
  const sleepLabel = isTogglingSleep
    ? "Please wait…"
    : isAsleep
      ? "Wake up"
      : "Go to sleep";

  // Capture the revision only when editing begins; subsequent query refreshes must not rebase unsaved edits.
  useEffect(() => {
    if (isDecorating && !draft && !isRefreshingFurniture) {
      const placements = recoverHomeLayout(layout, furniture, homeType);
      setDraft({ homeType, revision, placements, styles });
      setSelectedId(placements[0]?.id ?? null);
      setPlacementError(null);
    } else if (!isDecorating && draft) {
      dragRef.current = null;
      setDraft(null);
      setStorageTargetId(null);
    }
  }, [
    isDecorating,
    draft,
    layout,
    furniture,
    homeType,
    revision,
    isRefreshingFurniture,
  ]);

  /** Change placements without replacing the draft's optimistic concurrency snapshot. */
  const updatePlacements = (
    transform: (placements: HomePlacement[]) => HomePlacement[],
  ) => {
    if (isMovementDisabled) return;
    setPlacementError(null);
    setDraft(
      (current) => current && { ...current, placements: transform(current.placements) },
    );
  };

  /** Pointer and keyboard moves use the same painted floor and collision rules as saving. */
  const moveFurniture = (id: string, x: number, y: number, room?: HomeRoomId) => {
    const piece = furnitureById.get(id);
    if (!piece) return;
    if (
      room &&
      placements.filter(
        (placement) => placement.id !== id && getHomePlacementRoom(placement) === room,
      ).length >= HOME_FURNITURE_MAX_PLACEMENTS
    )
      return;
    updatePlacements((placements) =>
      placements.map((placement) =>
        placement.id === id
          ? (fitHomeFurniturePlacement(
              { ...placement, x, y, ...(room ? { room } : {}) },
              piece,
              placements,
              furniture,
              homeType,
            ) ?? placement)
          : placement,
      ),
    );
  };

  /** Removing a placement keeps the owned inventory row and its quantity unchanged. */
  const storeFurniture = (id: string) => {
    dragRef.current = null;
    setStorageTargetId(null);
    updatePlacements((placements) =>
      placements.filter((placement) => placement.id !== id),
    );
  };

  /** A drop onto another storage fixture takes precedence over floor collision fitting. */
  const findStorageTarget = (id: string, clientX: number, clientY: number) => {
    const drag = dragRef.current;
    // Tall art can cover the armory; selecting it must not count as a storage drop.
    if (!drag || Math.hypot(clientX - drag.clientX, clientY - drag.clientY) < 4)
      return null;
    const scene = sceneRef.current?.getBoundingClientRect();
    if (!scene?.width || !scene.height) return null;
    const x = (((clientX - scene.left) / scene.width) * 100 - camera.x) / camera.scale;
    const y = (((clientY - scene.top) / scene.height) * 100 - camera.y) / camera.scale;
    return (
      placements.find((placement) => {
        const piece = furnitureById.get(placement.id);
        if (placement.id === id || piece?.action !== "storage") return false;
        const bounds = roomBounds(piece, placement);
        return (
          x >= bounds.x &&
          x <= bounds.x + bounds.width &&
          y >= bounds.y &&
          y <= bounds.y + bounds.height
        );
      })?.id ?? null
    );
  };

  /** Cancellation restores the starting placement; a completed armory drop returns it to inventory. */
  const finishDrag = (
    id: string,
    pointerId: number,
    shouldRestore = false,
    targetId: string | null = null,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId || drag.placement.id !== id) return;
    dragRef.current = null;
    setStorageTargetId(null);
    if (shouldRestore)
      updatePlacements((placements) =>
        placements.map((placement) =>
          placement.id === id ? drag.placement : placement,
        ),
      );
    else if (targetId) storeFurniture(id);
  };

  /** Place an owned piece on nearby free ground; a full room leaves it safely in inventory. */
  const selectFurniture = (id: string) => {
    setSelectedId(id);
    const existing = placements.find((placement) => placement.id === id);
    if (existing) focusRoom(getHomePlacementRoom(existing));
    const piece = furnitureById.get(id);
    if (
      !piece ||
      placements.some((placement) => placement.id === id) ||
      hasPlacementLimit ||
      isMovementDisabled
    )
      return;
    const placement = fitHomeFurniturePlacement(
      {
        id,
        ...(activeRoom !== "main" ? { room: activeRoom } : {}),
        x: 50,
        y: piece.action === "farm" ? 95 : 50,
        rotation: 0,
      },
      piece,
      placements,
      furniture,
      homeType,
    );
    if (placement) updatePlacements((placements) => [...placements, placement]);
    else
      setPlacementError(
        `${piece.name} does not fit. Store or move another piece to make room.`,
      );
  };

  /** Keep the occupied floor center steady when changing between independently painted directions. */
  const rotateFurniture = () => {
    if (!selected || !selectedFurniture || isMovementDisabled) return;
    const rotations = getHomeFurnitureRotations(selectedFurniture);
    const rotation =
      rotations[(rotations.indexOf(selected.rotation) + 1) % rotations.length] ?? 0;
    const next = { ...selected, rotation };
    const before = getHomeFurnitureGeometry(selectedFurniture, selected).footprint;
    const after = getHomeFurnitureGeometry(selectedFurniture, next).footprint;
    const anchor = projectHomePlacement(next);
    const candidate = {
      ...next,
      ...unprojectHomePlacement({
        x: anchor.x + before.x + before.width / 2 - after.x - after.width / 2,
        y: anchor.y + before.y + before.height / 2 - after.y - after.height / 2,
      }),
    };
    const fitted = fitHomeFurniturePlacement(
      candidate,
      selectedFurniture,
      placements,
      furniture,
      homeType,
    );
    if (fitted)
      updatePlacements((placements) =>
        placements.map((placement) =>
          placement.id === selected.id ? fitted : placement,
        ),
      );
    else
      setPlacementError(
        "This view does not fit here. Move or store another piece first.",
      );
  };

  /** Preserve rejected drafts; only an accepted guarded save closes the editor. */
  const saveLayout = async () => {
    if (
      !draft ||
      !onSave ||
      isMovementDisabled ||
      hasMissingFurniture ||
      essentialsError
    )
      return;
    dragRef.current = null;
    setStorageTargetId(null);
    if (await onSave(draft)) onDecoratingChange(false);
  };

  return (
    <div className="space-y-3">
      {isProperty && (
        <fieldset
          className="flex flex-wrap items-center gap-2"
          aria-label="Property navigation"
        >
          {rooms.map((room) => (
            <Button
              key={room.id}
              variant={activeRoom === room.id ? "default" : "outline"}
              className="h-10"
              onClick={() => focusRoom(room.id)}
            >
              {room.name}
            </Button>
          ))}
          <Button
            variant="outline"
            aria-label="Zoom out"
            onClick={() =>
              setCamera((current) =>
                boundHomeCamera(
                  zoomHomeCamera(current, Math.max(0.3, current.scale - 0.15), {
                    x: 50,
                    y: 50,
                  }),
                  homeType,
                ),
              )
            }
          >
            −
          </Button>
          <output aria-label="Camera zoom" className="text-sm tabular-nums">
            {Math.round(camera.scale * 100)}%
          </output>
          <Button
            variant="outline"
            aria-label="Zoom in"
            onClick={() =>
              setCamera((current) =>
                boundHomeCamera(
                  zoomHomeCamera(current, Math.min(1.8, current.scale + 0.15), {
                    x: 50,
                    y: 50,
                  }),
                  homeType,
                ),
              )
            }
          >
            +
          </Button>
          <Button variant="outline" onClick={() => focusRoom("main")}>
            Reset view
          </Button>
        </fieldset>
      )}
      <fieldset
        ref={sceneRef}
        aria-label="Home scene"
        tabIndex={isProperty ? 0 : undefined}
        className={cn(
          "relative mx-auto aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-lg border border-stone-700/40 bg-[#24211c] shadow-md",
          isProperty &&
            "touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
        onKeyDown={(event) => {
          if (!isProperty || event.target !== event.currentTarget) return;
          const direction = FURNITURE_DIRECTIONS.find(({ key }) => key === event.key);
          if (!direction) return;
          event.preventDefault();
          setCamera((current) =>
            boundHomeCamera(
              {
                ...current,
                x: current.x - direction.dx * 10,
                y: current.y - direction.dy * 10,
              },
              homeType,
            ),
          );
        }}
        onPointerDown={(event) => {
          if (
            !isProperty ||
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          cameraPointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const previous = cameraPointers.current.get(event.pointerId);
          const rect = sceneRef.current?.getBoundingClientRect();
          if (!previous || !rect) return;
          const others = [...cameraPointers.current.entries()].filter(
            ([id]) => id !== event.pointerId,
          );
          const other = others[0]?.[1];
          cameraPointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          setCamera((current) => {
            const before = other
              ? Math.hypot(previous.x - other.x, previous.y - other.y)
              : 0;
            const after = other
              ? Math.hypot(event.clientX - other.x, event.clientY - other.y)
              : 0;
            if (other && before > 0) {
              const scale = Math.max(
                0.3,
                Math.min(1.8, (current.scale * after) / before),
              );
              const midpoint = {
                x: (((previous.x + other.x) / 2 - rect.left) / rect.width) * 100,
                y: (((previous.y + other.y) / 2 - rect.top) / rect.height) * 100,
              };
              const moved = {
                x: (((event.clientX + other.x) / 2 - rect.left) / rect.width) * 100,
                y: (((event.clientY + other.y) / 2 - rect.top) / rect.height) * 100,
              };
              return boundHomeCamera(
                zoomHomeCamera(current, scale, midpoint, moved),
                homeType,
              );
            }
            return boundHomeCamera(
              {
                ...current,
                x: current.x + ((event.clientX - previous.x) / rect.width) * 100,
                y: current.y + ((event.clientY - previous.y) / rect.height) * 100,
              },
              homeType,
            );
          });
        }}
        onPointerUp={(event) => cameraPointers.current.delete(event.pointerId)}
        onPointerCancel={(event) => cameraPointers.current.delete(event.pointerId)}
        onLostPointerCapture={(event) => cameraPointers.current.delete(event.pointerId)}
      >
        <div
          className="absolute inset-0 origin-top-left"
          data-home-camera
          style={{
            transform: `translate(${camera.x}%, ${camera.y}%) scale(${camera.scale})`,
          }}
        >
          {isProperty ? (
            <HomePropertyBackdrop
              homeType={homeType}
              styles={draft?.styles ?? styles}
            />
          ) : (
            !hasImageError && (
              <RoomImage
                homeType={homeType}
                onError={() => setFailedHomeType(homeType)}
              />
            )
          )}
          {!isProperty && (
            <HomePropertyBackdrop
              homeType={homeType}
              styles={draft?.styles ?? styles}
              overlay
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
            <span className="pointer-events-none absolute top-3 left-3 z-[140] rounded-full bg-slate-950/85 px-3 py-1 font-semibold text-amber-200 text-xs">
              Decorating
            </span>
          )}
          {placements.map((placement) => {
            const details = furnitureById.get(placement.id);
            // Inventory can change while editing; preserve the draft and give a recoverable save error below.
            if (!details) return null;
            const bounds = roomBounds(details, placement);
            const isSelected = isEditing && selectedId === placement.id;
            const label = isEditing
              ? `Move ${details.name}`
              : details.action === "sleep"
                ? `${details.name}: ${sleepLabel}`
                : details.action === "storage"
                  ? `${details.name}: ${isGuest ? "Home storage is in your own village" : "Open home storage"}`
                  : details.action === "kitchen"
                    ? `${details.name}: Open kitchen`
                    : details.action === "farm"
                      ? `${details.name}: Open farm`
                      : details.name;
            const style = {
              left: `${bounds.x}%`,
              top: `${bounds.y}%`,
              width: `${bounds.width}%`,
              height: `${bounds.height}%`,
              zIndex: details.isFloor
                ? 1
                : Math.round(projectHomePlacement(placement).y) + 2,
            };
            const className = cn(
              "group absolute rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white",
              isEditing
                ? "cursor-grab touch-none active:cursor-grabbing"
                : "cursor-pointer transition-[filter] hover:brightness-125",
              isSelected && "ring-2 ring-amber-300",
              storageTargetId === placement.id && "ring-4 ring-emerald-400",
              "disabled:cursor-not-allowed disabled:opacity-60",
            );
            const image = (
              <FurnitureImage
                furniture={details}
                rotation={placement.rotation}
                isInScene
              />
            );
            if (!isEditing && (!details.action || isVisiting))
              return (
                <div
                  key={placement.id}
                  className="pointer-events-none absolute"
                  style={style}
                >
                  {image}
                </div>
              );
            return (
              <button
                key={placement.id}
                type="button"
                aria-label={label}
                aria-pressed={isEditing ? isSelected : undefined}
                aria-description={
                  isEditing && details.action === "storage"
                    ? "Drop furniture here to store it"
                    : undefined
                }
                disabled={
                  isVisiting ||
                  (isEditing && isMovementDisabled) ||
                  (!isEditing &&
                    ((details.action === "storage" && isGuest) ||
                      (details.action === "sleep" && isTogglingSleep)))
                }
                className={className}
                style={style}
                onClick={(event) => {
                  if (isVisiting) return;
                  if (isEditing) setSelectedId(placement.id);
                  else if (details.action === "sleep") onSleep();
                  else if (details.action === "storage") onStorage(event.currentTarget);
                  else if (details.action === "kitchen") onKitchen(event.currentTarget);
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
                  event.stopPropagation();
                  setSelectedId(placement.id);
                  setActiveRoom(getHomePlacementRoom(placement));
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
                  const scene = sceneRef.current?.getBoundingClientRect();
                  if (
                    isMovementDisabled ||
                    !drag ||
                    drag.pointerId !== event.pointerId ||
                    drag.placement.id !== placement.id ||
                    !scene
                  )
                    return;
                  setStorageTargetId(
                    findStorageTarget(placement.id, event.clientX, event.clientY),
                  );
                  const origin = rooms.find(
                    ({ id }) => id === getHomePlacementRoom(drag.placement),
                  );
                  const anchor = projectHomePlacement(drag.placement);
                  const point = {
                    x:
                      (origin?.x ?? 0) +
                      anchor.x +
                      ((event.clientX - drag.clientX) / (scene.width * camera.scale)) *
                        100,
                    y:
                      (origin?.y ?? 0) +
                      anchor.y +
                      ((event.clientY - drag.clientY) / (scene.height * camera.scale)) *
                        100,
                  };
                  const target = rooms.find(
                    (room) =>
                      point.x >= room.x &&
                      point.x <= room.x + 100 &&
                      point.y >= room.y &&
                      point.y <= room.y + 100,
                  );
                  if (!target) return;
                  const local = unprojectHomePlacement({
                    x: point.x - target.x,
                    y: point.y - target.y,
                  });
                  moveFurniture(placement.id, local.x, local.y, target.id);
                }}
                onPointerUp={(event) =>
                  finishDrag(
                    placement.id,
                    event.pointerId,
                    false,
                    findStorageTarget(placement.id, event.clientX, event.clientY),
                  )
                }
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
                {isAsleep && !isEditing && details.action === "sleep" && (
                  // A decorative cue follows the bed's painted bounds; reduced motion keeps the letters still.
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-full left-1/2 flex -translate-x-1/2 items-end font-bold text-amber-100 text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] sm:text-2xl"
                  >
                    {["z", "z", "Z"].map((letter, index) => (
                      <span
                        key={index}
                        className="inline-block motion-safe:animate-home-sleep"
                        style={{
                          animationDelay: `${-index}s`,
                          fontSize: `${0.7 + index * 0.2}em`,
                        }}
                      >
                        {letter}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
          {!isProperty && !hasImageError && (
            <>
              <svg aria-hidden className="absolute h-0 w-0">
                <defs>
                  <clipPath id={foregroundId} clipPathUnits="objectBoundingBox">
                    {HOME_ROOM_GEOMETRY[homeType].foreground.map((polygon, index) => (
                      <polygon
                        key={index}
                        points={polygon
                          .map(({ x, y }) => `${x / 100},${y / 100}`)
                          .join(" ")}
                      />
                    ))}
                  </clipPath>
                </defs>
              </svg>
              {/* Reuse the room painting to put its front curtains above indoor sprites, without a second downloaded asset. */}
              <div
                className="pointer-events-none absolute inset-0 z-[100]"
                style={{ clipPath: `url(#${foregroundId})` }}
              >
                <RoomImage homeType={homeType} isForeground />
              </div>
            </>
          )}
        </div>
      </fieldset>
      {isEditing &&
        selected &&
        selectedFurniture &&
        (() => {
          const rotations = getHomeFurnitureRotations(selectedFurniture);
          return (
            <fieldset
              aria-label="Furniture controls"
              className="flex w-fit gap-1 rounded-md border bg-muted p-1 shadow-md"
            >
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                aria-label="Rotate clockwise"
                aria-description={`Current orientation: ${HOME_FURNITURE_ROTATION_DEGREES[selected.rotation]}°`}
                hoverText="Rotate clockwise"
                disabled={
                  isMovementDisabled ||
                  (rotations.length === 1 && rotations.includes(selected.rotation))
                }
                onClick={rotateFurniture}
              >
                <RotateCw className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                aria-label="Store"
                hoverText="Store in inventory"
                disabled={isMovementDisabled}
                onClick={() => storeFurniture(selected.id)}
              >
                <Package className="h-4 w-4" aria-hidden />
              </Button>
            </fieldset>
          );
        })()}
      {isProperty && (
        <p className="text-muted-foreground text-xs">
          Drag empty space to pan. Pinch or scroll to zoom. Focus the scene and use
          arrow keys to pan.
        </p>
      )}
      {isEditing && (
        <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              {rooms.find(({ id }) => id === activeRoom)?.name} ·{" "}
              {
                placements.filter(
                  (placement) => getHomePlacementRoom(placement) === activeRoom,
                ).length
              }
              /{HOME_FURNITURE_MAX_PLACEMENTS} pieces
            </span>
            {activeRoom !== "yard" && (
              <label className="text-sm">
                Wall paint{" "}
                <select
                  aria-label="Wall paint"
                  className="rounded border bg-background p-2"
                  disabled={isMovementDisabled}
                  value={
                    (draft?.styles ?? styles).find(({ room }) => room === activeRoom)
                      ?.paint ?? "ivory"
                  }
                  onChange={(event) => {
                    const paint = event.target.value as HomeRoomStyle["paint"];
                    setDraft(
                      (current) =>
                        current && {
                          ...current,
                          styles: [
                            ...current.styles.filter(({ room }) => room !== activeRoom),
                            {
                              room: activeRoom,
                              floor:
                                current.styles.find(({ room }) => room === activeRoom)
                                  ?.floor ?? "cedar",
                              paint,
                            },
                          ],
                        },
                    );
                  }}
                >
                  {Object.keys(HOME_WALL_PAINTS).map((paint) => (
                    <option key={paint} value={paint}>
                      {paint}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {activeRoom !== "yard" && (
              <label className="text-sm">
                Floor tiles{" "}
                <select
                  aria-label="Floor tiles"
                  className="rounded border bg-background p-2"
                  disabled={isMovementDisabled}
                  value={
                    (draft?.styles ?? styles).find(({ room }) => room === activeRoom)
                      ?.floor ?? "cedar"
                  }
                  onChange={(event) => {
                    const floor = event.target.value as HomeRoomStyle["floor"];
                    setDraft(
                      (current) =>
                        current && {
                          ...current,
                          styles: [
                            ...current.styles.filter(({ room }) => room !== activeRoom),
                            {
                              room: activeRoom,
                              paint:
                                current.styles.find(({ room }) => room === activeRoom)
                                  ?.paint ?? "ivory",
                              floor,
                            },
                          ],
                        },
                    );
                  }}
                >
                  {Object.keys(HOME_FLOOR_TILES).map((floor) => (
                    <option key={floor} value={floor}>
                      {floor}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected && isProperty && (
              <label className="text-sm">
                Move selected to{" "}
                <select
                  aria-label="Furniture room"
                  className="rounded border bg-background p-2"
                  disabled={isMovementDisabled}
                  value={getHomePlacementRoom(selected)}
                  onChange={(event) => {
                    const room = event.target.value as HomeRoomId;
                    const piece = furnitureById.get(selected.id);
                    if (!piece) return;
                    if (
                      placements.filter(
                        (placement) => getHomePlacementRoom(placement) === room,
                      ).length >= HOME_FURNITURE_MAX_PLACEMENTS
                    ) {
                      setPlacementError("This room is full");
                      return;
                    }
                    const fitted = fitHomeFurniturePlacement(
                      { ...selected, room },
                      piece,
                      placements,
                      furniture,
                      homeType,
                    );
                    if (fitted) {
                      updatePlacements((current) =>
                        current.map((placement) =>
                          placement.id === selected.id ? fitted : placement,
                        ),
                      );
                      focusRoom(room);
                    } else
                      setPlacementError("This furniture does not fit in that room");
                  }}
                >
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <fieldset
            aria-label="Owned furniture"
            className="flex min-w-0 gap-2 overflow-x-auto pb-1"
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
                  <div className="relative mb-1 aspect-[4/3] w-full">
                    <FurnitureImage furniture={piece} rotation={0} />
                  </div>
                  <span className="line-clamp-2 min-h-8">{piece.name}</span>
                  {copies.length > 1 && (
                    <span className="text-muted-foreground">
                      {copies.findIndex((other) => other.id === piece.id) + 1} /{" "}
                      {copies.length}
                    </span>
                  )}
                  {piece.quantity > 1 && (
                    <span className="text-muted-foreground">
                      Quantity: {piece.quantity}
                    </span>
                  )}
                  <span className="mt-auto pt-1 text-muted-foreground">
                    {isPlaced ? "Placed" : "Place"}
                  </span>
                </button>
              );
            })}
            {furniture.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Buy furniture in the item shop to furnish your home.
              </p>
            )}
          </fieldset>
          {hasPlacementLimit && (
            <p role="status" className="text-muted-foreground text-sm">
              Each room can display up to {HOME_FURNITURE_MAX_PLACEMENTS} pieces. Store
              a piece to make room.
            </p>
          )}
          {saveError && (
            <p role="alert" className="text-destructive text-sm">
              {saveError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              aria-label="Undo changes"
              hoverText="Undo changes"
              disabled={isSaving}
              onClick={() => {
                dragRef.current = null;
                setStorageTargetId(null);
                setPlacementError(null);
                const placements = recoverHomeLayout(layout, furniture, homeType);
                setDraft({ homeType, revision, placements, styles });
                setSelectedId(placements[0]?.id ?? null);
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              className="h-10"
              disabled={isSaving}
              onClick={() => onDecoratingChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-10"
              aria-label={isSaving ? "Saving…" : "Save layout"}
              disabled={isMovementDisabled || hasMissingFurniture || !!essentialsError}
              onClick={() => void saveLayout()}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden />
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {isTogglingSleep
          ? "Changing sleep status…"
          : isAsleep
            ? "You are asleep. Resting restores your energy."
            : "You are awake."}
      </p>
      {!isEditing && !isVisiting && (
        <fieldset
          aria-label="Home actions"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <Button onClick={onSleep} disabled={isTogglingSleep} className="h-11 px-2">
            <BedDouble className="mr-2 h-4 w-4" aria-hidden />
            {sleepLabel}
          </Button>
          <Button
            onClick={(event) => onStorage(event.currentTarget)}
            disabled={isGuest}
            className="h-11 px-2"
          >
            <Package className="mr-2 h-4 w-4" aria-hidden />
            Home storage
          </Button>
          <Button
            onClick={(event) => onKitchen(event.currentTarget)}
            className="h-11 px-2"
          >
            <ChefHat className="mr-2 h-4 w-4" aria-hidden />
            Kitchen
          </Button>
          <Button
            onClick={(event) => onFarm(event.currentTarget)}
            className="h-11 px-2"
          >
            <Sprout className="mr-2 h-4 w-4" aria-hidden />
            Farm
          </Button>
        </fieldset>
      )}
    </div>
  );
};

/** Tight alpha bounds crop transparent margins in CSS; every painted direction keeps its native proportions. */
const FurnitureImage = ({
  furniture,
  rotation,
  isInScene = false,
}: {
  furniture: HomeFurniture;
  rotation: HomeFurnitureRotation;
  isInScene?: boolean;
}) => {
  const view = getHomeFurnitureView(furniture, rotation);
  const bounds = view.geometry.visibleBounds;
  const aspectRatio = (view.geometry.aspectRatio * bounds.width) / bounds.height;
  return (
    <div
      className={cn(
        "pointer-events-none relative overflow-hidden",
        isInScene ? "h-full w-full" : "mx-auto max-h-full max-w-full",
      )}
      style={
        isInScene
          ? undefined
          : {
              aspectRatio,
              width: aspectRatio < 4 / 3 ? `${(aspectRatio / (4 / 3)) * 100}%` : "100%",
            }
      }
    >
      <picture
        className="absolute"
        style={{
          width: `${10000 / bounds.width}%`,
          height: `${10000 / bounds.height}%`,
          left: `${(-bounds.x / bounds.width) * 100}%`,
          top: `${(-bounds.y / bounds.height) * 100}%`,
        }}
      >
        <source
          srcSet={[128, 256, 400, 768]
            .map((width) => `${bunnyImageUrl(view.image, width)} ${width}w`)
            .join(", ")}
          sizes={
            isInScene
              ? `(max-width: 768px) ${view.width}vw, ${Math.round(view.width * 7.68)}px`
              : "80px"
          }
        />
        <Image
          src={bunnyImageUrl(view.image, isInScene ? 400 : 128)}
          alt=""
          width={400}
          height={Math.round(400 / view.geometry.aspectRatio)}
          className="h-full w-full select-none"
          draggable={false}
        />
      </picture>
    </div>
  );
};

/** Background and foreground reuse identical responsive URLs so the browser shares the downloaded image. */
const RoomImage = ({
  homeType,
  isForeground = false,
  onError,
}: {
  homeType: HomeType;
  isForeground?: boolean;
  onError?: () => void;
}) => (
  <picture className="pointer-events-none absolute inset-0">
    <source
      srcSet={[480, 768, 1024, 1448]
        .map(
          (width) => `${bunnyImageUrl(HOME_SCENE_IMAGES[homeType], width)} ${width}w`,
        )
        .join(", ")}
      sizes="(max-width: 768px) 100vw, 768px"
    />
    <Image
      src={bunnyImageUrl(HOME_SCENE_IMAGES[homeType], 768)}
      alt={isForeground ? "" : `${HomeTypeDetails[homeType].name} interior`}
      fill
      className="object-contain"
      loading="eager"
      fetchPriority={isForeground ? undefined : "high"}
      onError={onError}
    />
  </picture>
);

/** Keyboard users retain precise movement without a second visible movement toolbar. */
const FURNITURE_DIRECTIONS = [
  { key: "ArrowLeft", dx: -2, dy: 0 },
  { key: "ArrowUp", dx: 0, dy: -2 },
  { key: "ArrowDown", dx: 0, dy: 2 },
  { key: "ArrowRight", dx: 2, dy: 0 },
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

export type HomeDraft = {
  homeType: HomeType;
  revision: number;
  placements: HomePlacement[];
  styles: HomeRoomStyle[];
};

/** Draft editing changes placements only; game actions and persistence retain their existing page contracts. */
type HomeSceneProps = {
  homeType: HomeType;
  styles?: HomeRoomStyle[];
  isVisiting?: boolean;
  isGuest: boolean;
  isAsleep: boolean;
  isTogglingSleep: boolean;
  isDecorating: boolean;
  onDecoratingChange: (isDecorating: boolean) => void;
  onSleep: () => void;
  onStorage: (trigger: HTMLButtonElement) => void;
  onKitchen: (trigger: HTMLButtonElement) => void;
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
};
