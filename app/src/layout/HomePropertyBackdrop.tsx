import { useId } from "react";
import { HOME_FLOOR_TILES, HOME_WALL_PAINTS, type HomeType } from "@/drizzle/constants";
import { getHomeRooms } from "@/libs/homeProperty";
import { HOME_ROOM_GEOMETRY } from "@/libs/homeRoomGeometry";
import type { HomeRoomStyle } from "@/validators/home";

/** Vector room tiles share furniture's measured floor projection and stay sharp at every zoom. */
export const HomePropertyBackdrop = ({
  homeType,
  styles,
  overlay = false,
}: {
  homeType: HomeType;
  styles: HomeRoomStyle[];
  overlay?: boolean;
}) => {
  const patternId = useId();
  const rooms = getHomeRooms(homeType);
  const floor = HOME_ROOM_GEOMETRY[homeType].interior
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {!overlay &&
        rooms.flatMap((room) => {
          const right = rooms.find(
            (other) => other.x === room.x + 104 && other.y === room.y,
          );
          const below = rooms.find(
            (other) => other.x === room.x && other.y === room.y + 104,
          );
          return [
            ...(right
              ? [
                  <div
                    key={`hall-right-${room.id}`}
                    className="absolute bg-[#a68c62] shadow-inner"
                    style={{
                      left: `${room.x + 85}%`,
                      top: `${room.y + 46}%`,
                      width: "34%",
                      height: "11%",
                    }}
                  />,
                ]
              : []),
            ...(below
              ? [
                  <div
                    key={`hall-below-${room.id}`}
                    className="absolute bg-[#a68c62] shadow-inner"
                    style={{
                      left: `${room.x + 44}%`,
                      top: `${room.y + 70}%`,
                      width: "12%",
                      height: "90%",
                    }}
                  />,
                ]
              : []),
          ];
        })}
      {rooms.map((room) => {
        const style = styles.find(({ room: id }) => id === room.id);
        if (overlay && !style) return null;
        const paint = HOME_WALL_PAINTS[style?.paint ?? "ivory"];
        const tile = style?.floor ?? "cedar";
        const pattern = `${patternId}-${room.id}`;
        return (
          <div
            key={room.id}
            className="absolute h-full w-full"
            style={{ left: `${room.x}%`, top: `${room.y}%` }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              <defs>
                <pattern
                  id={pattern}
                  width={tile === "cedar" || tile === "oak" ? 18 : 8}
                  height="8"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="100%" height="100%" fill={HOME_FLOOR_TILES[tile]} />
                  <path
                    d={
                      tile === "cedar" || tile === "oak"
                        ? "M0 0H18V8H0ZM9 0V4M0 4H18"
                        : "M0 0H8V8H0Z"
                    }
                    fill="none"
                    stroke="#382b23"
                    strokeOpacity=".18"
                    strokeWidth=".3"
                  />
                </pattern>
              </defs>
              {!overlay && (
                <>
                  <rect
                    x="4"
                    y="5"
                    width="92"
                    height="78"
                    rx="3"
                    fill={room.isYard ? "#526b42" : "#483629"}
                  />
                  <path d="M10 12H90V77H10Z" fill={room.isYard ? "#809564" : paint} />
                  <path
                    d="M11 19L7 10H93L89 19Z"
                    fill={room.isYard ? "#91a278" : paint}
                  />
                  <path
                    d="M11 19L7 10V78L11 75ZM89 19L93 10V78L89 75Z"
                    fill="#423323"
                    opacity=".3"
                  />
                </>
              )}
              <polygon
                points={floor}
                fill={room.isYard ? "#8da96b" : `url(#${pattern})`}
                style={
                  overlay ? { mixBlendMode: "multiply", opacity: 0.72 } : undefined
                }
              />
              {overlay && (
                <path
                  d="M13 9H87V19H13Z"
                  fill={paint}
                  opacity=".65"
                  style={{ mixBlendMode: "color" }}
                />
              )}
              {!overlay && (
                <>
                  {/* Openings align with the continuous paths between room tiles. */}
                  {rooms.some(
                    (other) => other.y === room.y && other.x === room.x - 104,
                  ) && <path d="M0 46H13V57H0Z" fill="#a68c62" />}
                  {rooms.some(
                    (other) => other.y === room.y && other.x === room.x + 104,
                  ) && <path d="M87 46H100V57H87Z" fill="#a68c62" />}
                  {rooms.some(
                    (other) => other.x === room.x && other.y === room.y + 104,
                  ) && <path d="M44 72H56V100H44Z" fill="#a68c62" />}
                  {rooms.some(
                    (other) => other.x === room.x && other.y === room.y - 104,
                  ) && <path d="M44 0H56V27H44Z" fill="#a68c62" />}
                  <path
                    d="M10 45H14M10 58H14M86 45H90M86 58H90M43 74V80M57 74V80"
                    stroke="#e7d5a5"
                    strokeWidth="1.4"
                  />
                  <rect x="37" y="8" width="26" height="6" rx="1" fill="#3f342a" />
                  <text
                    x="50"
                    y="12.2"
                    textAnchor="middle"
                    fontSize="3"
                    fill="#fff1cf"
                    fontFamily="serif"
                  >
                    {room.name}
                  </text>
                  <path d="M19 14H29M71 14H81" stroke="#f8e2ab" strokeWidth="2" />
                  {room.isYard && (
                    <>
                      <rect
                        x="2"
                        y="86"
                        width="96"
                        height="13"
                        rx="2"
                        fill="#755339"
                        stroke="#c5ac78"
                        strokeWidth=".8"
                      />
                      <path
                        d="M5 90H95M5 94H95M5 98H95"
                        stroke="#503922"
                        strokeWidth=".7"
                      />
                      <text x="9" y="83" fontSize="3" fill="#e7f4c9">
                        Decorative lawn · farm beds below
                      </text>
                      <path
                        d="M5 20V72M95 20V72"
                        stroke="#b9c79e"
                        strokeDasharray="3 2"
                        strokeWidth="1"
                      />
                    </>
                  )}
                </>
              )}
            </svg>
          </div>
        );
      })}
    </div>
  );
};
