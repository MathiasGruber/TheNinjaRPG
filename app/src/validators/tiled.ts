import { z } from "zod";
import { SECTOR_MAP_MAX_DIMENSION } from "@/drizzle/constants";

const TiledPropertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  value: z.unknown(),
});

const TiledObjectSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  // Tiled 1.9+ renamed object "type" to "class"; re-exported maps may carry
  // either field, so the importer accepts both
  class: z.string().optional(),
  // Tile-objects (e.g. decorations dragged from the tileset palette) reference
  // their tileset tile by gid; the importer inherits that tile's properties
  gid: z.number().optional(),
  x: z.number(),
  y: z.number(),
  // Tile-object display size; a creator resizing the object in Tiled changes
  // these, and the importer turns that into the rendered sprite size (WYSIWYG)
  width: z.number().optional(),
  height: z.number().optional(),
  properties: z.array(TiledPropertySchema).optional(),
});

// Element-count caps so a crafted upload cannot make the importer do
// unbounded work. Tiled arrays are otherwise attacker-sized: a giant
// tiles[]/objects[] would turn the per-cell property lookup into an O(n^2)
// hang. Bounds are generous vs. any real 64x64 map but reject abusive inputs.
const MAX_CELLS = SECTOR_MAP_MAX_DIMENSION * SECTOR_MAP_MAX_DIMENSION;
const MAX_TILESET_TILES = 4096;
const MAX_OBJECTS = 2 * MAX_CELLS;
const MAX_LAYERS = 16;
const MAX_TILESETS = 64;
const MAX_PROPERTIES = 64;

const TiledLayerSchema = z.object({
  name: z.string(),
  type: z.string(),
  data: z.array(z.number()).max(MAX_CELLS).optional(),
  objects: z.array(TiledObjectSchema).max(MAX_OBJECTS).optional(),
  properties: z.array(TiledPropertySchema).max(MAX_PROPERTIES).optional(),
});

const TiledTilesetTileSchema = z.object({
  id: z.number(),
  type: z.string().optional(),
  // Tiled 1.9+ writes tile "type" as "class" when re-saving
  class: z.string().optional(),
  // Native sprite size of a collection-tileset tile: the baseline for telling
  // an untouched tile-object (renders at the asset's default size) apart from
  // one the creator resized in Tiled (renders at the resized size)
  imageheight: z.number().optional(),
  properties: z.array(TiledPropertySchema).max(MAX_PROPERTIES).optional(),
});

const TiledTilesetSchema = z.object({
  firstgid: z.number(),
  tiles: z.array(TiledTilesetTileSchema).max(MAX_TILESET_TILES).optional(),
});

export const TiledMapSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  orientation: z.string(),
  // "odd" (default) = game-native row order; "even" = the WYSIWYG convention
  // the Tiled kit ships, with rows mirrored so Tiled shows the game view
  staggerindex: z.string().optional(),
  infinite: z.boolean().optional(),
  width: z.number().int(),
  height: z.number().int(),
  tilewidth: z.number().positive(),
  tileheight: z.number().positive(),
  layers: z.array(TiledLayerSchema).max(MAX_LAYERS),
  tilesets: z.array(TiledTilesetSchema).max(MAX_TILESETS).optional(),
});

export type TiledProperty = z.infer<typeof TiledPropertySchema>;
export type TiledLayer = z.infer<typeof TiledLayerSchema>;
export type TiledMap = z.infer<typeof TiledMapSchema>;
export type TiledTileset = z.infer<typeof TiledTilesetSchema>;
