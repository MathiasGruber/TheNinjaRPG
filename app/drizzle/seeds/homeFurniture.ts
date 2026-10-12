import { sql } from "drizzle-orm";
import { item } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { FURNITURE_ITEM_DEFAULTS } from "@/validators/itemFurniture";

/** Stock furnishings are ordinary Item content and remain editable through the manual. */
export const seedHomeFurniture = async (client: DrizzleClient) => {
  await client
    .insert(item)
    .values(
      stockHomeFurniture.map((definition) => ({
        ...FURNITURE_ITEM_DEFAULTS,
        itemType: "FURNITURE" as const,
        rarity: "COMMON" as const,
        hidden: false,
        inShop: definition.cost > 0,
        canBeTraded: definition.cost > 0,
        ...definition,
      })),
    )
    .onDuplicateKeyUpdate({ set: { id: sql`${item.id}` } });
};

const stockHomeFurniture = [
  {
    id: "home-bed",
    name: "Bed",
    description: "Rest here to sleep or wake up.",
    image: "/images/home/furniture/bed.webp",
    cost: 0,
    furnitureWidth: 34.0,
    furnitureGroundAnchor: 91.1,
    furnitureAction: "sleep",
    furnitureIsFloor: false,
  },
  {
    id: "home-armory",
    name: "Armory",
    description: "Open your home storage.",
    image: "/images/home/furniture/armory.webp",
    cost: 0,
    furnitureWidth: 24.0,
    furnitureGroundAnchor: 95.8,
    furnitureAction: "storage",
    furnitureIsFloor: false,
  },
  {
    id: "home-kitchen",
    name: "Kitchen",
    description: "Visit the ramen shop while cooking is being prepared.",
    image: "/images/home/furniture/kitchen.webp",
    cost: 0,
    furnitureWidth: 32.0,
    furnitureGroundAnchor: 89.1,
    furnitureAction: "kitchen",
    furnitureIsFloor: false,
  },
  {
    id: "home-garden",
    name: "Garden",
    description: "Visit your farm.",
    image: "/images/home/furniture/garden.webp",
    cost: 0,
    furnitureWidth: 29.0,
    furnitureGroundAnchor: 88.3,
    furnitureAction: "farm",
    furnitureIsFloor: false,
  },
  {
    id: "home-rug",
    name: "Woven Rug",
    description: "A warm woven accent for your floor.",
    image: "/images/home/furniture/rug.webp",
    cost: 25000,
    furnitureWidth: 25.0,
    furnitureGroundAnchor: 88.5,
    furnitureAction: null,
    furnitureIsFloor: true,
  },
  {
    id: "home-table",
    name: "Tea Table",
    description: "A low wooden table for quiet moments.",
    image: "/images/home/furniture/table.webp",
    cost: 50000,
    furnitureWidth: 19.0,
    furnitureGroundAnchor: 90.3,
    furnitureAction: null,
    furnitureIsFloor: false,
  },
  {
    id: "home-bookshelf",
    name: "Bookshelf",
    description: "Keep your favorite stories close at hand.",
    image: "/images/home/furniture/bookshelf.webp",
    cost: 75000,
    furnitureWidth: 19.0,
    furnitureGroundAnchor: 89.6,
    furnitureAction: null,
    furnitureIsFloor: false,
  },
  {
    id: "home-lantern",
    name: "Paper Lantern",
    description: "A soft light for your home.",
    image: "/images/home/furniture/lantern.webp",
    cost: 30000,
    furnitureWidth: 13.0,
    furnitureGroundAnchor: 93.6,
    furnitureAction: null,
    furnitureIsFloor: false,
  },
  {
    id: "home-bonsai",
    name: "Bonsai",
    description: "A carefully tended miniature tree.",
    image: "/images/home/furniture/bonsai.webp",
    cost: 40000,
    furnitureWidth: 16.0,
    furnitureGroundAnchor: 95.9,
    furnitureAction: null,
    furnitureIsFloor: false,
  },
  {
    id: "home-sofa",
    name: "Sofa",
    description: "A comfortable place to unwind.",
    image: "/images/home/furniture/sofa.webp",
    cost: 100000,
    furnitureWidth: 26.0,
    furnitureGroundAnchor: 88.4,
    furnitureAction: null,
    furnitureIsFloor: false,
  },
  {
    id: "home-screen",
    name: "Folding Screen",
    description: "Divide your room with a wooden screen.",
    image: "/images/home/furniture/screen.webp",
    cost: 80000,
    furnitureWidth: 24.0,
    furnitureGroundAnchor: 86.6,
    furnitureAction: null,
    furnitureIsFloor: false,
  },
  {
    id: "home-pond",
    name: "Stone Pond",
    description: "A peaceful water feature for your home.",
    image: "/images/home/furniture/pond.webp",
    cost: 150000,
    furnitureWidth: 25.0,
    furnitureGroundAnchor: 85.8,
    furnitureAction: null,
    furnitureIsFloor: false,
  },
] satisfies Pick<
  typeof item.$inferInsert,
  | "id"
  | "name"
  | "description"
  | "image"
  | "cost"
  | "furnitureAction"
  | "furnitureWidth"
  | "furnitureGroundAnchor"
  | "furnitureIsFloor"
>[];
