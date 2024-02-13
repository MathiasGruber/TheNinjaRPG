export const SECTOR_WIDTH = 20;
export const SECTOR_HEIGHT = 15;

export const ALLIANCEHALL_LONG = 10;
export const ALLIANCEHALL_LAT = 7;

export const HOSPITAL_LONG = 12;
export const HOSPITAL_LAT = 8;

export const TREES_PATH = "craftpix-949054/PNG/Assets_separately/Trees_texture_shadow/";
export const STONES_PATH = "craftpix-377140/PNG/Objects_separately/";

export const combatAssetsNames = [
  "",
  "Rock1_1",
  "Rock1_2",
  "Rock2_1",
  "Rock2_2",
  "Rock5_1",
  "Rock5_2",
  "Rock6_1",
  "Rock6_2",
] as const;

export type CombatAssetName = (typeof combatAssetsNames)[number];

export const groundAssets = [
  { filepath: TREES_PATH, filename: "Moss_tree1.png", chance: 0.05 },
  { filepath: TREES_PATH, filename: "Moss_tree2.png", chance: 0.1 },
  { filepath: TREES_PATH, filename: "Moss_tree3.png", chance: 0.15 },
  { filepath: TREES_PATH, filename: "Fruit_tree1.png", chance: 0.2 },
  { filepath: TREES_PATH, filename: "Fruit_tree2.png", chance: 0.25 },
  { filepath: TREES_PATH, filename: "Fruit_tree3.png", chance: 0.3 },
  { filepath: TREES_PATH, filename: "Tree1.png", chance: 0.4 },
  { filepath: TREES_PATH, filename: "Tree2.png", chance: 0.5 },
  { filepath: TREES_PATH, filename: "Tree3.png", chance: 0.6 },
  { filepath: STONES_PATH, filename: "Rock1_1.png", chance: 0.605 },
  { filepath: STONES_PATH, filename: "Rock1_2.png", chance: 0.61 },
  { filepath: STONES_PATH, filename: "Rock1_3.png", chance: 0.615 },
  { filepath: STONES_PATH, filename: "Rock1_4.png", chance: 0.62 },
  { filepath: STONES_PATH, filename: "Rock4_1.png", chance: 0.625 },
  { filepath: STONES_PATH, filename: "Rock4_2.png", chance: 0.63 },
  { filepath: STONES_PATH, filename: "Rock4_3.png", chance: 0.635 },
  { filepath: STONES_PATH, filename: "Rock4_4.png", chance: 0.64 },
];

export const dessertAssets = [
  { filepath: STONES_PATH, filename: "Rock1_1.png", chance: 0.005 / 2 },
  { filepath: STONES_PATH, filename: "Rock1_2.png", chance: 0.01 / 2 },
  { filepath: STONES_PATH, filename: "Rock1_3.png", chance: 0.015 / 2 },
  { filepath: STONES_PATH, filename: "Rock1_4.png", chance: 0.02 / 2 },
  { filepath: STONES_PATH, filename: "Rock2_1.png", chance: 0.025 / 2 },
  { filepath: STONES_PATH, filename: "Rock2_2.png", chance: 0.03 / 2 },
  { filepath: STONES_PATH, filename: "Rock2_3.png", chance: 0.035 / 2 },
  { filepath: STONES_PATH, filename: "Rock2_4.png", chance: 0.04 / 2 },
  { filepath: STONES_PATH, filename: "Rock5_1.png", chance: 0.045 / 2 },
  { filepath: STONES_PATH, filename: "Rock5_2.png", chance: 0.05 / 2 },
  { filepath: STONES_PATH, filename: "Rock5_3.png", chance: 0.055 / 2 },
  { filepath: STONES_PATH, filename: "Rock5_4.png", chance: 0.06 / 2 },
  { filepath: STONES_PATH, filename: "Rock6_1.png", chance: 0.065 / 2 },
  { filepath: STONES_PATH, filename: "Rock6_2.png", chance: 0.07 / 2 },
  { filepath: STONES_PATH, filename: "Rock6_3.png", chance: 0.075 / 2 },
  { filepath: STONES_PATH, filename: "Rock6_4.png", chance: 0.08 / 2 },
  { filepath: STONES_PATH, filename: "Rock7_1.png", chance: 0.085 / 2 },
  { filepath: STONES_PATH, filename: "Rock7_2.png", chance: 0.09 / 2 },
  { filepath: STONES_PATH, filename: "Rock7_3.png", chance: 0.095 / 2 },
  { filepath: STONES_PATH, filename: "Rock7_4.png", chance: 0.1 / 2 },
  { filepath: TREES_PATH, filename: "Burned_tree1.png", chance: 0.125 / 2 },
  { filepath: TREES_PATH, filename: "Burned_tree2.png", chance: 0.15 / 2 },
  { filepath: TREES_PATH, filename: "Burned_tree2.png", chance: 0.175 / 2 },
];

export const oceanAssets = [
  { filepath: TREES_PATH, filename: "Broken_tree7.png", chance: 0.001 },
];
