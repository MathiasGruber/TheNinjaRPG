import { HOME_FURNITURE_STARTERS, type HomeFurnitureAction } from "@/drizzle/constants";
import type { HomePlacement } from "@/validators/home";

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
};

/** Reset only owned action fixtures; additional decorations remain available in storage. */
export const getDefaultHomeLayout = (furniture: HomeFurniture[]): HomePlacement[] => {
  const actions: HomeFurnitureAction[] = ["sleep", "storage", "kitchen", "farm"];
  return HOME_FURNITURE_STARTERS.flatMap((starter, index) => {
    const fixture =
      furniture.find((piece) => piece.itemId === starter.itemId) ??
      furniture.find((piece) => piece.action === actions[index]);
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
            rotation: piece.homeRotation === 1 ? 1 : 0,
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
