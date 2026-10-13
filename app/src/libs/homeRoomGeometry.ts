import type { HomeType } from "@/drizzle/constants";

/** Saved anchors map to the shared overhead room camera, including its front garden. */
export const HOME_FLOOR_PROJECTION = {
  x: 8,
  y: 26,
  scaleX: 0.84,
  scaleY: 0.72,
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

/** Front walls share a silhouette; only their painted floor edge changes between buildings. */
const buildingForeground = [
  [
    { x: 2.9696, y: 74.5856 },
    { x: 35.1519, y: 74.5856 },
    { x: 35.1519, y: 74.1252 },
    { x: 40.0552, y: 74.1252 },
    { x: 40.1934, y: 75.4144 },
    { x: 42.6796, y: 75.4144 },
    { x: 42.6796, y: 86.5562 },
    { x: 40.3315, y: 87.0166 },
    { x: 40.1243, y: 90.1473 },
    { x: 35.6354, y: 90.1473 },
    { x: 35.2901, y: 86.2799 },
    { x: 6.6989, y: 86.2799 },
    { x: 4.6961, y: 83.7937 },
    { x: 2.9696, y: 80.9392 },
  ],
  [
    { x: 57.5276, y: 75.4144 },
    { x: 59.9448, y: 75.4144 },
    { x: 60.0138, y: 74.1252 },
    { x: 64.9171, y: 74.1252 },
    { x: 64.9862, y: 74.5856 },
    { x: 97.9282, y: 74.5856 },
    { x: 97.9282, y: 80.9392 },
    { x: 95.9945, y: 84.4383 },
    { x: 93.9227, y: 86.4641 },
    { x: 65.1243, y: 86.4641 },
    { x: 64.9171, y: 90.1473 },
    { x: 60.2901, y: 90.1473 },
    { x: 60.0829, y: 87.0166 },
    { x: 57.5276, y: 86.5562 },
  ],
];

/** Move the front wall's upper silhouette with its floor edge, retaining the garden-facing base. */
const frontWallsAt = (floorEdge: number) =>
  buildingForeground.map((polygon) =>
    polygon.map((point) => ({
      x: point.x,
      y: point.y < 80 ? point.y + floorEdge - 75.2302 : point.y,
    })),
  );

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
  STUDIO_APARTMENT: {
    interior: [
      { x: 13.1906, y: 18.9687 },
      { x: 86.1878, y: 18.8766 },
      { x: 89.0884, y: 75.2302 },
      { x: 10.8425, y: 75.2302 },
    ],
    outdoor,
    foreground: frontWallsAt(75.2302),
  },
  ONE_BED_APARTMENT: {
    interior: [
      { x: 13.1215, y: 19.1529 },
      { x: 86.1188, y: 19.1529 },
      { x: 89.0884, y: 74.954 },
      { x: 10.7044, y: 74.954 },
    ],
    outdoor,
    foreground: frontWallsAt(74.954),
  },
  TWO_BED_HOUSE: {
    interior: [
      { x: 12.8453, y: 18.7845 },
      { x: 86.326, y: 18.7845 },
      { x: 89.1575, y: 72.8361 },
      { x: 10.7044, y: 72.8361 },
    ],
    outdoor,
    foreground: frontWallsAt(72.8361),
  },
  TOWN_HOUSE: {
    interior: [
      { x: 12.9144, y: 19.0608 },
      { x: 86.5331, y: 19.0608 },
      { x: 89.0193, y: 74.8619 },
      { x: 10.6354, y: 74.8619 },
    ],
    outdoor,
    foreground: frontWallsAt(74.8619),
  },
  SMALL_MANSION: {
    interior: [
      { x: 13.1215, y: 19.6133 },
      { x: 86.6022, y: 19.6133 },
      { x: 89.2956, y: 75.1381 },
      { x: 10.7044, y: 75.1381 },
    ],
    outdoor,
    foreground: frontWallsAt(75.1381),
  },
  SMALL_ESTATE: {
    interior: [
      { x: 13.1215, y: 19.2449 },
      { x: 86.6022, y: 19.2449 },
      { x: 89.2956, y: 75.046 },
      { x: 10.7044, y: 75.046 },
    ],
    outdoor,
    foreground: frontWallsAt(75.046),
  },
  LARGE_ESTATE: {
    interior: [
      { x: 13.1215, y: 19.7974 },
      { x: 86.6713, y: 19.7974 },
      { x: 89.2956, y: 74.5856 },
      { x: 10.7044, y: 74.5856 },
    ],
    outdoor,
    foreground: frontWallsAt(74.5856),
  },
  PALACE: {
    interior: [
      { x: 12.9834, y: 20.3499 },
      { x: 86.7403, y: 20.3499 },
      { x: 89.2956, y: 74.6777 },
      { x: 10.6354, y: 74.6777 },
    ],
    outdoor,
    foreground: frontWallsAt(74.6777),
  },
  MARSHMALLOWOPOLIS: {
    interior: [
      { x: 12.9834, y: 18.8766 },
      { x: 86.6022, y: 18.8766 },
      { x: 89.2956, y: 75.046 },
      { x: 10.6354, y: 75.046 },
    ],
    outdoor,
    foreground: frontWallsAt(75.046),
  },
} satisfies Record<HomeType, RoomGeometry>;
