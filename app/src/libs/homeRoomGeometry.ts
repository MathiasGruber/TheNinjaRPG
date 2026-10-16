import type { HomeType } from "@/drizzle/constants";

/** Saved anchors map to the shared overhead room camera, including its front garden. */
export const HOME_FLOOR_PROJECTION = {
  x: 8,
  y: 26,
  scaleX: 0.84,
  scaleY: 0.72,
} as const;

/** Shared floor rectangles leave room for the wall face between adjoining placement regions. */
export const HOME_BUILDING_GEOMETRY = {
  stepX: 82,
  stepY: 67,
  interior: [
    { x: 12, y: 20 },
    { x: 90, y: 20 },
    { x: 90, y: 75 },
    { x: 12, y: 75 },
  ],
  lawn: [
    { x: 2, y: 8 },
    { x: 98, y: 8 },
    { x: 98, y: 79 },
    { x: 2, y: 79 },
  ],
} as const;

type HomePoint = { x: number; y: number };
type RoomGeometry = {
  interior: HomePoint[];
  outdoor: HomePoint[];
  foreground: HomePoint[][];
};

/** Every painting leaves the same front garden beneath its curtains and lantern posts. */
const outdoor = [
  { x: 0.9669, y: 86.372 },
  { x: 99.0331, y: 86.372 },
  { x: 99.0331, y: 98.9871 },
  { x: 0.9669, y: 98.9871 },
];

/** Composed buildings share floor and garden boundaries without a painted foreground. */
const buildingRoomGeometry: RoomGeometry = {
  interior: [...HOME_BUILDING_GEOMETRY.interior],
  outdoor,
  foreground: [],
};

/** Measured floor edges keep indoor footprints clear of walls while the foreground covers their shadows. */
export const HOME_ROOM_GEOMETRY = {
  NONE: {
    interior: [
      { x: 12.9144, y: 18.8766 },
      { x: 86.4641, y: 18.8766 },
      { x: 88.4669, y: 75.4144 },
      { x: 11.1878, y: 75.4144 },
    ],
    outdoor,
    foreground: [
      [
        { x: 3.453, y: 73.849 },
        { x: 35.0829, y: 75.046 },
        { x: 35.4972, y: 73.9411 },
        { x: 38.4669, y: 73.9411 },
        { x: 39.2956, y: 73.7569 },
        { x: 40.0552, y: 74.5856 },
        { x: 41.1602, y: 78.0847 },
        { x: 42.2652, y: 83.7017 },
        { x: 41.5746, y: 85.175 },
        { x: 40.4006, y: 85.3591 },
        { x: 40.4006, y: 89.8711 },
        { x: 35.9116, y: 89.8711 },
        { x: 35.221, y: 86.372 },
        { x: 6.4917, y: 85.7274 },
        { x: 4.9724, y: 82.965 },
      ],
      [
        { x: 57.942, y: 84.07 },
        { x: 59.1851, y: 76.6114 },
        { x: 60.3591, y: 73.7569 },
        { x: 61.6022, y: 73.849 },
        { x: 62.5691, y: 73.849 },
        { x: 62.8453, y: 75.1381 },
        { x: 92.7486, y: 75.046 },
        { x: 96.616, y: 73.6648 },
        { x: 96.8923, y: 80.2026 },
        { x: 95.6492, y: 83.3333 },
        { x: 94.4751, y: 85.7274 },
        { x: 64.5718, y: 85.9116 },
        { x: 64.5718, y: 89.8711 },
        { x: 59.7376, y: 89.8711 },
        { x: 59.6685, y: 85.7274 },
        { x: 58.1492, y: 85.175 },
      ],
    ],
  },
  STUDIO_APARTMENT: buildingRoomGeometry,
  ONE_BED_APARTMENT: buildingRoomGeometry,
  TWO_BED_HOUSE: buildingRoomGeometry,
  TOWN_HOUSE: buildingRoomGeometry,
  SMALL_MANSION: buildingRoomGeometry,
  SMALL_ESTATE: buildingRoomGeometry,
  LARGE_ESTATE: buildingRoomGeometry,
  PALACE: buildingRoomGeometry,
  MARSHMALLOWOPOLIS: buildingRoomGeometry,
} satisfies Record<HomeType, RoomGeometry>;
