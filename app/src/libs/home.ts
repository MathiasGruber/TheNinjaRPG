import { HomeFurnitureCoreIds, type HomeType } from "@/drizzle/constants";
import type { HomeFurnitureState, HomePlacement } from "@/validators/home";

/** The common isometric floor keeps the four existing home actions present on every tier. */
export const getDefaultHomeLayout = (): HomePlacement[] => [
  { id: "bed", x: 22, y: 25, rotation: 0 },
  { id: "armory", x: 75, y: 20, rotation: 0 },
  { id: "kitchen", x: 22, y: 78, rotation: 0 },
  { id: "garden", x: 78, y: 78, rotation: 0 },
];

/** Return an independent draft so rearranging a room never mutates cached ownership or layouts. */
export const getHomeLayout = (homeType: HomeType, furniture: HomeFurnitureState) =>
  (furniture.layouts[homeType] ?? getDefaultHomeLayout()).map((placement) => ({
    ...placement,
  }));

/** Placement validation depends on server-owned inventory, never client-supplied ownership. */
export const homeLayoutOwnershipError = (
  placements: HomePlacement[],
  furniture: HomeFurnitureState,
) => {
  const available = new Set<string>([...HomeFurnitureCoreIds, ...furniture.owned]);
  return placements.some((placement) => !available.has(placement.id))
    ? "Purchase furniture before placing it in your home"
    : null;
};
