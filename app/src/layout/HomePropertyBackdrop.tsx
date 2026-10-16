import { useId } from "react";
import {
  type CombatBiome,
  HOME_FLOOR_TILES,
  HOME_ROOM_IDS,
  HOME_WALL_PAINTS,
  type HomeType,
  HomeTypeDetails,
} from "@/drizzle/constants";
import Image from "@/layout/Image";
import { HOME_ART_PLANS } from "@/libs/homeRoomGeometry";
import { STRUCTURE_GROUND_TERRAIN } from "@/libs/sector-map/terrains";
import type { HomeRoomStyle } from "@/validators/home";

/** One complete painting supplies the property and depth masks, so walls and scenery always join. */
export const HomePropertyBackdrop = ({
  homeType,
  biome = "ground",
  styles,
  onError,
}: {
  homeType: HomeType;
  biome?: CombatBiome;
  styles: HomeRoomStyle[];
  onError?: () => void;
}) => {
  const id = useId();
  const plan = HOME_ART_PLANS[homeType];
  const terrain = STRUCTURE_GROUND_TERRAIN[biome];
  const src = `/images/home/${homeType.toLowerCase()}-${terrain}.webp`;
  const size = { width: `${plan.size}%`, height: `${plan.size}%` };
  return (
    <>
      <div
        data-home-art={homeType}
        data-home-biome={terrain}
        className="pointer-events-none absolute"
        style={size}
      >
        <Image
          src={src}
          alt={`${HomeTypeDetails[homeType].name} interior and garden`}
          fill
          unoptimized
          className="select-none"
          loading="eager"
          fetchPriority="high"
          onError={onError}
        />
      </div>
      {styles.map((style) => {
        const index = HOME_ROOM_IDS.indexOf(style.room);
        const surfaces = plan.floorSurfaces[index];
        const texture = HOME_FLOOR_TILES[style.floor];
        if (!surfaces || !texture) return null;
        const points = surfaces.flat();
        const left = Math.min(...points.map(([x]) => x));
        const top = Math.min(...points.map(([, y]) => y));
        return (
          <svg
            key={style.room}
            aria-hidden
            className="pointer-events-none absolute"
            data-home-room-style={style.room}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ ...size, zIndex: 1 }}
          >
            <defs>
              <clipPath id={`${id}-${style.room}-floor`}>
                {surfaces.map((polygon, index) => (
                  <polygon
                    key={index}
                    points={polygon.map(([x, y]) => `${x},${y}`).join(" ")}
                  />
                ))}
              </clipPath>
            </defs>
            {/* The complete painting supplies the floor if this optional finish fails to load. */}
            <image
              href={texture}
              x={left}
              y={top}
              width={Math.max(...points.map(([x]) => x)) - left}
              height={Math.max(...points.map(([, y]) => y)) - top}
              preserveAspectRatio="none"
              clipPath={`url(#${id}-${style.room}-floor)`}
            />
          </svg>
        );
      })}
      {plan.foreground.map(({ polygon, depth }, index) => (
        <div
          key={index}
          aria-hidden
          data-home-foreground={depth}
          className="pointer-events-none absolute"
          style={{
            ...size,
            zIndex: Math.round((depth * plan.size) / 10),
            clipPath: `polygon(${polygon.map(([x, y]) => `${x}% ${y}%`).join(",")})`,
          }}
        >
          <Image
            src={src}
            alt=""
            fill
            unoptimized
            className="select-none"
            loading="eager"
            onError={onError}
          />
        </div>
      ))}
      {styles.flatMap((style) => {
        const index = HOME_ROOM_IDS.indexOf(style.room);
        return (plan.paint[index] ?? []).map((polygon, panel) => (
          <svg
            key={`${style.room}-${panel}`}
            aria-hidden
            data-home-wall-paint={style.room}
            className="pointer-events-none absolute"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              ...size,
              mixBlendMode: "color",
              opacity: 0.7,
              zIndex:
                Math.round((Math.max(...polygon.map(([, y]) => y)) * plan.size) / 10) +
                1,
            }}
          >
            <polygon
              points={polygon.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={HOME_WALL_PAINTS[style.paint]}
              fillRule="evenodd"
            />
          </svg>
        ));
      })}
    </>
  );
};
