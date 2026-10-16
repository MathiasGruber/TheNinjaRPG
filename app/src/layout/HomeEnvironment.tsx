import { useId } from "react";
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
  const sceneryId = useId();
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
  // Merge exposed wall runs before placing groves, so planting follows the silhouette rather than the room grid.
  const edges: { x: number; top: number; bottom: number; side: -1 | 1 }[] = [];
  for (const room of homeType === "NONE" ? [] : building) {
    for (const side of [-1, 1] as const) {
      if (
        building.some(
          ({ x, y }) =>
            x === room.x + side * HOME_BUILDING_GEOMETRY.stepX && y === room.y,
        )
      )
        continue;
      const x = room.x + (side < 0 ? 8 : 94);
      const previous = edges.find(
        (edge) => edge.x === x && edge.side === side && edge.bottom >= room.y + 3,
      );
      if (previous) previous.bottom = room.y + 87;
      else edges.push({ x, top: room.y + 3, bottom: room.y + 87, side });
    }
  }
  const scenery = edges.flatMap((edge, index) => {
    const span = edge.bottom - edge.top;
    return (span > 140 ? [0.24, 0.72] : [0.86]).flatMap((fraction, cluster) => {
      const size = [34, 40, 30][(index + cluster) % 3] ?? 34;
      const y = edge.top + span * fraction;
      return [
        {
          key: species.trees[(index + cluster) % species.trees.length],
          x: edge.x + edge.side * (size / 2 + 2),
          y,
          width: size,
          height: size * 1.3,
        },
        {
          key: species.plants[index % species.plants.length],
          x: edge.x + edge.side * 6,
          y: Math.min(y + 7, edge.bottom - 5),
          width: 5,
          height: 7,
        },
        {
          key: species.plants[(index + 1) % species.plants.length],
          x: edge.x + edge.side * 18,
          y: Math.min(y + 10, edge.bottom - 2),
          width: 7,
          height: 8,
        },
      ];
    });
  });
  // A deep L-shaped setback has space for a second grove beyond the planting beside its exposed wall.
  for (const room of homeType === "NONE" ? [] : building) {
    const x = room.x + HOME_BUILDING_GEOMETRY.stepX * 2;
    if (
      x + 100 > width ||
      building.some((other) => other.y === room.y && other.x > room.x)
    )
      continue;
    scenery.push(
      {
        key: species.trees[2 % species.trees.length],
        x: x + 47,
        y: room.y + 74,
        width: 38,
        height: 50,
      },
      { key: species.plants[0], x: x + 28, y: room.y + 83, width: 7, height: 8 },
      { key: species.plants[1], x: x + 62, y: room.y + 80, width: 5, height: 7 },
    );
  }
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
        const painted = key ? HOME_SCENERY_ART[key] : undefined;
        const crop = painted?.split(" ").map(Number);
        const cropId = `${sceneryId}-${key}-${x}-${y}`;
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
            {painted && crop ? (
              <svg
                aria-hidden="true"
                className="h-full w-full"
                viewBox={painted}
                preserveAspectRatio="xMidYMax meet"
              >
                <defs>
                  <clipPath id={cropId}>
                    <rect x={crop[0]} y={crop[1]} width={crop[2]} height={crop[3]} />
                  </clipPath>
                </defs>
                <image
                  href="/images/home/scenery.webp"
                  width="1536"
                  height="1024"
                  clipPath={`url(#${cropId})`}
                  // Optional scenery failures must not trigger the home's artwork recovery state.
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              </svg>
            ) : (
              <Image
                src={asset.filepath}
                alt=""
                fill
                sizes="(max-width: 768px) 7vw, 54px"
                className="object-contain object-bottom"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
          </div>
        );
      })}
    </>
  );
};

/** Painted interpretations retain the sector map's species, with measured bounds and room-scale detail. */
const HOME_SCENERY_ART: Record<string, string> = {
  "tree.green.round": "49 59 438 423",
  "tree.green.tall": "646 31 246 452",
  "tree.green.wide": "997 63 509 418",
  "tree.snow.pine": "85 543 368 417",
  "cactus.saguaro": "650 530 244 429",
  "cactus.cluster": "1103 580 309 378",
  "cactus.barrel": "1103 580 309 378",
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
