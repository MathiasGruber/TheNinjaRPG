import { useId } from "react";
import { HOME_FLOOR_TILES, HOME_WALL_PAINTS, type HomeType } from "@/drizzle/constants";
import { getHomeRooms, getHomeWalls, type HomeWall } from "@/libs/homeProperty";
import { HOME_ROOM_GEOMETRY } from "@/libs/homeRoomGeometry";
import type { HomeRoomStyle } from "@/validators/home";

/** Floors, shared walls and furniture use the same plan, without baking partitions into the floor art. */
export const HomePropertyBackdrop = ({
  homeType,
  styles,
  onError,
}: {
  homeType: HomeType;
  styles: HomeRoomStyle[];
  onError?: () => void;
}) => {
  const clipId = useId();
  const rooms = getHomeRooms(homeType);
  if (homeType === "NONE") {
    const style = styles.find(({ room }) => room === "main");
    if (!style) return null;
    return (
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
    );
  }
  const walls = getHomeWalls(homeType);
  const width = Math.max(...rooms.map(({ x, width }) => x + width));
  const height = Math.max(...rooms.map(({ y }) => y + 100));
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
      <div
        data-home-grounds
        className="absolute"
        style={{
          width: `${width}%`,
          height: `${height}%`,
          backgroundImage: "url(/images/home/ground.webp)",
          backgroundSize: `${10000 / width}% ${10000 / height}%`,
        }}
      />
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
                  <clipPath id={`${clipId}-farm`}>
                    <rect x="1" y="86.4" width="98" height="12.6" />
                  </clipPath>
                </defs>
                <image
                  href="/images/home/yard.webp"
                  width="100"
                  height="100"
                  preserveAspectRatio="none"
                  clipPath={`url(#${clipId}-farm)`}
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

/** Slice one continuous side-wall painting by ground depth so tall furniture occludes it naturally. */
const PaintedWall = ({
  wall,
  paint,
  onError,
}: {
  wall: HomeWall;
  paint: HomeRoomStyle["paint"];
  onError?: () => void;
}) => {
  const art = WALL_ART[wall.kind];
  const slices = wall.kind === "vertical" ? Math.ceil(wall.height / 6) : 1;
  return Array.from({ length: slices }, (_, index) => {
    const top = (index / slices) * 100;
    const bottom = ((index + 1) / slices) * 100;
    return (
      <svg
        aria-hidden="true"
        key={index}
        data-home-wall={wall.kind}
        data-home-wall-room={wall.room}
        viewBox={art.viewBox}
        preserveAspectRatio="none"
        className="pointer-events-none absolute"
        style={{
          left: `${wall.x}%`,
          top: `${wall.y}%`,
          width: `${wall.width}%`,
          height: `${wall.height}%`,
          zIndex: Math.round(
            (wall.kind === "vertical"
              ? wall.y + (wall.height * bottom) / 100
              : wall.depth) * 10,
          ),
          clipPath: `inset(${top}% 0 ${100 - bottom}% 0)`,
          transform: wall.isMirrored ? "scaleX(-1)" : undefined,
        }}
      >
        <image href={art.src} width={art.width} height={art.height} onError={onError} />
        {/* Only plaster receives color; timber, metal and window glass retain their painted details. */}
        <svg
          aria-hidden="true"
          x={art.x}
          y={art.y}
          width={art.cropWidth}
          height={art.cropHeight}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d={art.plaster}
            fill={HOME_WALL_PAINTS[paint]}
            style={{
              mixBlendMode: "multiply",
              opacity: paint === "ivory" ? 0 : paint === "charcoal" ? 0.95 : 0.72,
            }}
          />
        </svg>
      </svg>
    );
  });
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
    viewBox: "46 141 2081 394",
    x: 46,
    y: 141,
    cropWidth: 2081,
    cropHeight: 394,
    plaster: "M2 31H34V85H2ZM64 31H98V85H64Z",
  },
  vertical: {
    src: "/images/home/wall-vertical.webp",
    width: 887,
    height: 1774,
    viewBox: "321 16 244 1739",
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
