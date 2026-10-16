import {
  type CombatBiome,
  type HomeType,
  IMG_BG_DESSERT,
  IMG_BG_SNOW,
} from "@/drizzle/constants";
import Image from "@/layout/Image";
import { getHomeOverviewCamera, getHomeRooms } from "@/libs/homeProperty";
import { HOME_BUILDING_GEOMETRY } from "@/libs/homeRoomGeometry";
import { DECORATION_ASSETS_BY_KEY } from "@/libs/sector-map/decorations";
import {
  BUILTIN_TERRAINS_BY_KEY,
  STRUCTURE_GROUND_TERRAIN,
} from "@/libs/sector-map/terrains";
import { bunnyImageUrl } from "@/utils/image";

/** Village terrain and peripheral map scenery share the property's camera and ground depth. */
export const HomeEnvironment = ({
  homeType,
  biome,
}: {
  homeType: HomeType;
  biome: CombatBiome;
}) => {
  const rooms = getHomeRooms(homeType);
  const building = rooms.filter(({ isYard }) => !isYard);
  const width = Math.max(...rooms.map(({ x, width }) => x + width));
  const height = Math.max(...rooms.map(({ y }) => y + 100));
  const margin = 100 / Math.min(0.3, getHomeOverviewCamera(homeType).scale);
  const terrain = STRUCTURE_GROUND_TERRAIN[biome];
  const ground = BUILTIN_TERRAINS_BY_KEY.get(terrain);
  const texture =
    terrain === "ground"
      ? "/images/home/ground.webp"
      : bunnyImageUrl(terrain === "dessert" ? IMG_BG_DESSERT : IMG_BG_SNOW, 768);
  const species =
    terrain === "dessert"
      ? HOME_SCENERY.dessert
      : terrain === "snow"
        ? HOME_SCENERY.snow
        : HOME_SCENERY.ground;
  // Entire sprite bounds stay beyond exterior walls; missing room slots become small groves.
  const scenery = (homeType === "NONE" ? [] : building).flatMap((room, index) =>
    ([-1, 1] as const).flatMap((side) => {
      const hasNeighbor = building.some(
        ({ x, y }) =>
          x === room.x + side * HOME_BUILDING_GEOMETRY.stepX && y === room.y,
      );
      if (hasNeighbor) return [];
      return [
        {
          key: species.trees[index % species.trees.length],
          x: room.x + (side < 0 ? -4 : 104),
          y: room.y + 64,
          width: 18,
          height: 28,
        },
        ...[30, 72].map((y, offset) => ({
          key: species.plants[(index + offset) % species.plants.length],
          x: room.x + (side < 0 ? 3 : 97),
          y: room.y + y,
          width: 5,
          height: 7,
        })),
      ];
    }),
  );
  return (
    <>
      <div
        data-home-grounds={terrain}
        className="pointer-events-none absolute"
        aria-hidden
        style={{
          left: `${-margin}%`,
          top: `${-margin}%`,
          width: `${width + margin * 2}%`,
          height: `${height + margin * 2}%`,
          backgroundColor: ground?.colors[1],
          backgroundImage: `url(${texture})`,
          backgroundBlendMode: terrain === "dessert" ? "multiply" : undefined,
          backgroundSize: `${10000 / (width + margin * 2)}% ${10000 / (height + margin * 2)}%`,
        }}
      />
      {scenery.map(({ key, x, y, width, height }) => {
        const asset = key ? DECORATION_ASSETS_BY_KEY.get(key) : undefined;
        if (!asset) return null;
        return (
          <div
            key={`${key}-${x}-${y}`}
            data-home-scenery={key}
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: `${x - width / 2}%`,
              top: `${y - height}%`,
              width: `${width}%`,
              height: `${height}%`,
              zIndex: Math.round(y * 10),
            }}
          >
            <Image
              src={asset.filepath}
              alt=""
              fill
              sizes="180px"
              className="object-contain object-bottom"
              draggable={false}
              // Optional scenery failures must not trigger the home's artwork recovery state.
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
          </div>
        );
      })}
    </>
  );
};

/** Reuse the sector map's species so each village has a consistent surrounding landscape. */
const HOME_SCENERY = {
  ground: {
    trees: ["tree.green.round", "tree.green.tall", "tree.green.wide"],
    plants: ["grass.tuft", "grass.flower", "grass.sprout", "grass.pebble"],
  },
  dessert: {
    trees: ["cactus.saguaro", "cactus.cluster", "cactus.barrel"],
    plants: ["rock.sand", "rock.grey", "rock.slate"],
  },
  snow: {
    trees: ["tree.snow.pine"],
    plants: ["rock.grey", "rock.slate"],
  },
};
