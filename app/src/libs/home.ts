import {
  HOME_FURNITURE_ROTATION_DEGREES,
  HOME_FURNITURE_ROTATIONS,
  HOME_FURNITURE_STARTERS,
  type HomeFurnitureAction,
  type HomeFurnitureRotation,
} from "@/drizzle/constants";
import type { HomePlacement } from "@/validators/home";
import type { FurnitureViews } from "@/validators/itemFurniture";

/** A furniture instance is an owned inventory row; content supplies its appearance and home action. */
export type HomeFurniture = {
  id: string;
  itemId: string;
  name: string;
  description: string;
  image: string;
  width: number;
  groundAnchor: number;
  action: HomeFurnitureAction | null;
  isFloor: boolean;
  quantity: number;
  views: FurnitureViews;
};

/** Only published directions can be selected; the canonical image is always available. */
export const getHomeFurnitureRotations = (furniture: Pick<HomeFurniture, "views">) =>
  HOME_FURNITURE_ROTATIONS.filter(
    (rotation) =>
      rotation === 0 ||
      !!furniture.views?.[HOME_FURNITURE_ROTATION_DEGREES[rotation]]?.image,
  );

/** Removed or incomplete directions render the canonical art until the player saves a new facing. */
export const getHomeFurnitureView = (
  furniture: Pick<HomeFurniture, "image" | "width" | "groundAnchor" | "views">,
  rotation: HomeFurnitureRotation,
) => {
  const degrees = HOME_FURNITURE_ROTATION_DEGREES[rotation];
  const view = degrees === 0 ? undefined : furniture.views?.[degrees];
  return {
    image: view?.image ?? furniture.image,
    width: view?.width ?? furniture.width,
    groundAnchor: view?.groundAnchor ?? furniture.groundAnchor,
  };
};

/** Reset only owned action fixtures; additional decorations remain available in storage. */
export const getDefaultHomeLayout = (furniture: HomeFurniture[]): HomePlacement[] => {
  const actions: HomeFurnitureAction[] = ["sleep", "storage", "kitchen", "farm"];
  return HOME_FURNITURE_STARTERS.flatMap((starter, index) => {
    const fixture =
      furniture.find(
        (piece) => piece.itemId === starter.itemId && piece.action === actions[index],
      ) ?? furniture.find((piece) => piece.action === actions[index]);
    return fixture
      ? [{ id: fixture.id, x: starter.x, y: starter.y, rotation: 0 as const }]
      : [];
  });
};

/** Null coordinates keep an owned item unplaced without a second inventory or layout document. */
export const getHomeLayout = (
  items: {
    id: string;
    homeX: number | null;
    homeY: number | null;
    homeRotation: number;
  }[],
): HomePlacement[] =>
  items.flatMap((piece) =>
    piece.homeX !== null && piece.homeY !== null
      ? [
          {
            id: piece.id,
            x: piece.homeX,
            y: piece.homeY,
            rotation: HOME_FURNITURE_ROTATIONS.includes(
              piece.homeRotation as HomeFurnitureRotation,
            )
              ? (piece.homeRotation as HomeFurnitureRotation)
              : 0,
          },
        ]
      : [],
  );

/** Server-owned row IDs prevent placing another account's item or a non-furniture item. */
export const homeLayoutOwnershipError = (
  placements: HomePlacement[],
  furniture: Pick<HomeFurniture, "id">[],
) => {
  const available = new Set(furniture.map((piece) => piece.id));
  return placements.some((placement) => !available.has(placement.id))
    ? "Furniture is no longer available. Reload your home and try again"
    : null;
};

/** A stale editor cannot save a direction whose art was removed or belongs to another skin. */
export const homeLayoutOrientationError = (
  placements: HomePlacement[],
  furniture: Pick<HomeFurniture, "id" | "views">[],
) => {
  const available = new Map(
    furniture.map((piece) => [piece.id, getHomeFurnitureRotations(piece)]),
  );
  return placements.some(
    (placement) => !available.get(placement.id)?.includes(placement.rotation),
  )
    ? "A furniture orientation is no longer available. Reload your home and try again"
    : null;
};
