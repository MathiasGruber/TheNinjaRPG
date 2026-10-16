import { useId } from "react";
import {
  type CombatBiome,
  HOME_FLOOR_TILES,
  HOME_WALL_PAINTS,
  type HomeType,
} from "@/drizzle/constants";
import { HomeEnvironment } from "@/layout/HomeEnvironment";
import { getHomeRooms, getHomeWalls, type HomeWall } from "@/libs/homeProperty";
import { HOME_ROOM_GEOMETRY } from "@/libs/homeRoomGeometry";
import type { HomeRoomStyle } from "@/validators/home";

/** Floors, shared walls and furniture use the same plan, without baking partitions into the floor art. */
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
  const clipId = useId();
  const rooms = getHomeRooms(homeType);
  if (homeType === "NONE") {
    const style = styles.find(({ room }) => room === "main");
    return (
      <>
        {/* Feather only the exterior terrain; the authored canvas, foliage and entrance keep their coordinates. */}
        <svg aria-hidden="true" className="absolute h-0 w-0">
          <defs>
            <filter id={`${clipId}-edge`}>
              <feGaussianBlur stdDeviation="0.5" />
            </filter>
            <mask id={`${clipId}-exterior`} maskContentUnits="objectBoundingBox">
              <rect width="1" height="1" fill="white" />
              <g transform="scale(.01)" filter={`url(#${clipId}-edge)`}>
                <path d="M7 2H93L98 85H3ZM44 86H56L59 100H38Z" fill="black" />
                {HOME_ROOM_GEOMETRY.NONE.foreground.map((polygon, index) => (
                  <polygon
                    key={index}
                    points={polygon.map(({ x, y }) => `${x},${y}`).join(" ")}
                    fill="black"
                  />
                ))}
              </g>
            </mask>
          </defs>
        </svg>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ mask: `url(#${clipId}-exterior)` }}
        >
          <HomeEnvironment homeType={homeType} biome={biome} />
        </div>
        {style && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            data-home-room-style="main"
          >
            <defs>
              <clipPath id={clipId}>
                <polygon
                  points={HOME_ROOM_GEOMETRY.NONE.interior
                    .map(({ x, y }) => `${x},${y}`)
                    .join(" ")}
                />
              </clipPath>
            </defs>
            {style.floor !== "cedar" && (
              <image
                href={HOME_FLOOR_TILES[style.floor]}
                width="100"
                height="100"
                preserveAspectRatio="none"
                clipPath={`url(#${clipId})`}
                onError={onError}
              />
            )}
            <path
              d="M13 9H87V19H13Z"
              fill={HOME_WALL_PAINTS[style.paint]}
              style={{ mixBlendMode: "color", opacity: 0.65 }}
            />
          </svg>
        )}
      </>
    );
  }
  const walls = getHomeWalls(homeType);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          <radialGradient id={`${clipId}-light`}>
            <stop stopColor="#ffe3a0" stopOpacity="0.24" />
            <stop offset="1" stopColor="#ffe3a0" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      <HomeEnvironment homeType={homeType} biome={biome} />
      {rooms.map((room) => {
        const style = styles.find(({ room: id }) => id === room.id);
        return (
          <svg
            aria-hidden="true"
            key={room.id}
            data-home-room={room.id}
            data-home-room-style={!room.isYard && style ? room.id : undefined}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute h-full w-full"
            style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%` }}
          >
            {room.isYard ? (
              <>
                <defs>
                  <pattern
                    id={`${clipId}-fence`}
                    patternUnits="userSpaceOnUse"
                    width={8000 / room.width}
                    height="8"
                  >
                    <YardArt
                      x={0}
                      y={0}
                      width={4000 / room.width}
                      height={8}
                      viewBox="135 0 400 150"
                      onError={onError}
                    />
                    <g transform={`translate(${8000 / room.width} 0) scale(-1 1)`}>
                      <YardArt
                        x={0}
                        y={0}
                        width={4000 / room.width}
                        height={8}
                        viewBox="135 0 400 150"
                        onError={onError}
                      />
                    </g>
                  </pattern>
                  <linearGradient
                    id={`${clipId}-soil-edge`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop stopColor="white" stopOpacity="0" />
                    <stop offset="1" stopColor="white" />
                  </linearGradient>
                  <mask id={`${clipId}-farm`}>
                    <rect
                      x="0"
                      y="80"
                      width="100"
                      height="6.4"
                      fill={`url(#${clipId}-soil-edge)`}
                    />
                    <rect x="0" y="86.4" width="100" height="13.6" fill="white" />
                  </mask>
                </defs>
                <image
                  href="/images/home/yard.webp"
                  width="100"
                  height="100"
                  preserveAspectRatio="none"
                  mask={`url(#${clipId}-farm)`}
                  onError={onError}
                />
                {/* Painted perimeter details stay outside the lawn and farm placement regions. */}
                <rect
                  x={2 - 600 / room.width}
                  y="0"
                  width={96 + 1200 / room.width}
                  height="8"
                  fill={`url(#${clipId}-fence)`}
                />
                <g transform="translate(0 79)">
                  <rect
                    x={2 - 600 / room.width}
                    y="0"
                    width={96 + 1200 / room.width}
                    height="7.3"
                    fill={`url(#${clipId}-fence)`}
                  />
                </g>
                <YardArt
                  x={2 - 600 / room.width}
                  y={0}
                  width={600 / room.width}
                  height={86.3}
                  viewBox="0 40 210 720"
                  onError={onError}
                />
                <YardArt
                  x={98}
                  y={0}
                  width={600 / room.width}
                  height={86.3}
                  viewBox="1238 40 210 720"
                  onError={onError}
                />
                <YardArt
                  x={4000 / room.width}
                  y={0}
                  width={2000 / room.width}
                  height={8}
                  viewBox="548 0 352 150"
                  onError={onError}
                />
                <YardArt
                  x={50 - 1000 / room.width}
                  y={79}
                  width={2000 / room.width}
                  height={7.3}
                  viewBox="548 0 352 150"
                  onError={onError}
                />
              </>
            ) : (
              <>
                <image
                  href={HOME_FLOOR_TILES[style?.floor ?? "cedar"]}
                  x="12"
                  y="20"
                  width="82"
                  height="67"
                  preserveAspectRatio="none"
                  onError={onError}
                />
                <path
                  d="M12 75V20H94"
                  fill="none"
                  stroke="#291d12"
                  strokeOpacity="0.15"
                  strokeWidth="1.5"
                />
                <ellipse
                  cx="19"
                  cy="23"
                  rx="16"
                  ry="12"
                  fill={`url(#${clipId}-light)`}
                />
                <ellipse
                  cx="81"
                  cy="23"
                  rx="16"
                  ry="12"
                  fill={`url(#${clipId}-light)`}
                />
              </>
            )}
          </svg>
        );
      })}
      {walls.map((wall) => (
        <PaintedWall
          key={wall.id}
          wall={wall}
          paint={styles.find(({ room }) => room === wall.room)?.paint ?? "ivory"}
          onError={onError}
        />
      ))}
    </div>
  );
};

/** Reuse measured landscape details without stretching the legal decoration ground. */
const YardArt = ({
  x,
  y,
  width,
  height,
  viewBox,
  onError,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewBox: string;
  onError?: () => void;
}) => (
  <svg
    aria-hidden="true"
    x={x}
    y={y}
    width={width}
    height={height}
    viewBox={viewBox}
    preserveAspectRatio="none"
    data-home-yard-border
  >
    <image href="/images/home/yard.webp" width="1448" height="1086" onError={onError} />
  </svg>
);

/** Keep junction caps at beam height and slice capless side walls by ground depth for furniture occlusion. */
const PaintedWall = ({
  wall,
  paint,
  onError,
}: {
  wall: HomeWall;
  paint: HomeRoomStyle["paint"];
  onError?: () => void;
}) => {
  const paintId = useId();
  const art = WALL_ART[wall.kind];
  const slices = wall.kind === "vertical" ? Math.ceil(wall.height / 6) : 1;
  // The cap owns the wall junction; only the shaft stretches to meet the floor.
  const frames =
    wall.kind === "post"
      ? [
          { viewBox: "390 179 474 486", y: wall.y, height: 5.5 },
          { viewBox: "390 665 474 413", y: wall.y + 5.5, height: wall.height - 5.5 },
        ]
      : [{ viewBox: art.viewBox, y: wall.y, height: wall.height }];
  const color = HOME_WALL_PAINTS[paint];
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(color.slice(start, start + 2), 16) / 180,
  );
  return frames.flatMap((frame, frameIndex) =>
    Array.from({ length: slices }, (_, index) => {
      const top = (index / slices) * 100;
      const bottom = ((index + 1) / slices) * 100;
      return (
        <svg
          aria-hidden="true"
          key={`${frameIndex}-${index}`}
          data-home-wall={wall.kind}
          data-home-wall-room={wall.room}
          viewBox={frame.viewBox}
          preserveAspectRatio="none"
          className="pointer-events-none absolute"
          style={{
            left: `${wall.x}%`,
            top: `${frame.y}%`,
            width: `${wall.width}%`,
            height: `${frame.height}%`,
            zIndex: Math.round(
              (wall.kind === "vertical"
                ? wall.y + (wall.height * bottom) / 100
                : wall.depth) * 10,
            ),
            clipPath: `inset(${top}% 0 ${100 - bottom}% 0)`,
            transform: wall.isMirrored ? "scaleX(-1)" : undefined,
          }}
        >
          <image
            href={art.src}
            width={art.width}
            height={art.height}
            onError={onError}
          />
          {/* Neutralize the warm plaster before tinting its luminance; timber and glass keep their colors. */}
          {paint !== "ivory" && art.plaster && (
            <>
              {index === 0 && frameIndex === 0 && (
                <defs>
                  <clipPath id={`${paintId}-plaster`}>
                    <path
                      d={art.plaster}
                      fill={color}
                      transform={`translate(${art.x} ${art.y}) scale(${art.cropWidth / 100} ${art.cropHeight / 100})`}
                    />
                  </clipPath>
                  <filter id={`${paintId}-paint`} colorInterpolationFilters="sRGB">
                    <feColorMatrix type="saturate" values="0" />
                    <feComponentTransfer>
                      <feFuncR type="linear" slope={channels[0]} />
                      <feFuncG type="linear" slope={channels[1]} />
                      <feFuncB type="linear" slope={channels[2]} />
                    </feComponentTransfer>
                  </filter>
                </defs>
              )}
              <image
                href={art.src}
                width={art.width}
                height={art.height}
                filter={`url(#${paintId}-paint)`}
                clipPath={`url(#${paintId}-plaster)`}
              />
            </>
          )}
        </svg>
      );
    }),
  );
};

/** Source bounds remove transparent canvas padding without resampling or rotating wall faces. */
const WALL_ART = {
  solid: {
    src: "/images/home/wall-horizontal.webp",
    width: 2172,
    height: 724,
    viewBox: "16 194 2140 330",
    x: 16,
    y: 194,
    cropWidth: 2140,
    cropHeight: 330,
    plaster: "M1 35H99V85H1Z",
  },
  window: {
    src: "/images/home/wall-window.webp",
    width: 2172,
    height: 724,
    viewBox: "911 255 352 250",
    x: 911,
    y: 255,
    cropWidth: 352,
    cropHeight: 250,
    plaster: "",
  },
  vertical: {
    src: "/images/home/wall-vertical.webp",
    width: 887,
    height: 1774,
    viewBox: "321 180 244 1400",
    x: 321,
    y: 16,
    cropWidth: 244,
    cropHeight: 1739,
    plaster: "M58 8H92V92H58Z",
  },
  lantern: {
    src: "/images/home/wall-lantern.webp",
    width: 1086,
    height: 1448,
    viewBox: "275 108 536 1221",
    x: 275,
    y: 108,
    cropWidth: 536,
    cropHeight: 1221,
    plaster: "",
  },
  post: {
    src: "/images/home/wall-post.webp",
    width: 1254,
    height: 1254,
    viewBox: "390 179 474 899",
    x: 390,
    y: 179,
    cropWidth: 474,
    cropHeight: 899,
    plaster: "M38 57H73V91H38Z",
  },
} as const;
