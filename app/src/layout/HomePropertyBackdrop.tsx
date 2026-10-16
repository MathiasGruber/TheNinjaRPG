import { useId } from "react";
import { HOME_FLOOR_TILES, HOME_WALL_PAINTS, type HomeType } from "@/drizzle/constants";
import { getHomeRooms, type HomeRoom } from "@/libs/homeProperty";
import { HOME_ROOM_GEOMETRY } from "@/libs/homeRoomGeometry";
import type { HomeRoomStyle } from "@/validators/home";

/** Painted floor materials and wall tints preserve the room's detail; passages connect tiles below furniture. */
export const HomePropertyBackdrop = ({
  homeType,
  styles,
}: {
  homeType: HomeType;
  styles: HomeRoomStyle[];
}) => {
  const floorId = useId();
  const rooms = getHomeRooms(homeType);
  const floor = HOME_ROOM_GEOMETRY[homeType].interior
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {rooms.map((room) => {
        const style = styles.find(({ room: id }) => id === room.id);
        if (room.isYard || !style) return null;
        const floorImage = HOME_FLOOR_TILES[style.floor];
        return (
          <div
            key={room.id}
            data-home-room-style={room.id}
            className="absolute h-full w-full"
            style={{ left: `${room.x}%`, top: `${room.y}%` }}
          >
            {floorImage && (
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                <defs>
                  <clipPath id={`${floorId}-${room.id}`}>
                    <polygon points={floor} />
                  </clipPath>
                </defs>
                {/* Clip material paintings to the measured floor so each tier keeps its own walls. */}
                <image
                  href={floorImage}
                  width="100"
                  height="100"
                  preserveAspectRatio="none"
                  clipPath={`url(#${floorId}-${room.id})`}
                />
              </svg>
            )}
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              style={{ mixBlendMode: "color", opacity: 0.65 }}
            >
              <path d="M13 9H87V19H13Z" fill={HOME_WALL_PAINTS[style.paint]} />
            </svg>
          </div>
        );
      })}
      {rooms.flatMap((room) => [
        ...(rooms.some((other) => other.x === room.x + 104 && other.y === room.y)
          ? [<PaintedPassage key={`right-${room.id}`} room={room} />]
          : []),
        ...(rooms.some((other) => other.x === room.x && other.y === room.y + 104)
          ? [<PaintedPassage key={`below-${room.id}`} room={room} isVertical />]
          : []),
      ])}
    </div>
  );
};

/** The viewBox trims transparent canvas padding for display while preserving the source painting. */
const PaintedPassage = ({
  room,
  isVertical = false,
}: {
  room: HomeRoom;
  isVertical?: boolean;
}) => (
  <svg
    aria-hidden="true"
    data-home-passage={isVertical ? "vertical" : "horizontal"}
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    className="absolute"
    style={{
      left: `${room.x + (isVertical ? 44 : 85)}%`,
      top: `${room.y + (isVertical ? 70 : 46)}%`,
      width: isVertical ? "12%" : "34%",
      height: isVertical ? "54%" : "11%",
    }}
  >
    <g transform={isVertical ? "rotate(90 50 50)" : undefined}>
      <svg
        aria-hidden="true"
        x="0"
        y="0"
        width="100"
        height="100"
        viewBox="10 210 2156 295"
        preserveAspectRatio="none"
        overflow="hidden"
      >
        <image href="/images/home/passage.webp" width="2176" height="720" />
      </svg>
    </g>
  </svg>
);
