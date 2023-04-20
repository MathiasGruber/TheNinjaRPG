import {
  Group,
  TextureLoader,
  SpriteMaterial,
  Sprite,
  Texture,
  Vector3,
  LinearFilter,
} from "three";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../travel/types";

import { findHex } from "../travel/sector";
import type { DrawnCombatUser } from "./types";

/**
 * Draw a status bar on user
 */
const drawStatusBar = (
  w: number,
  h: number,
  color: string,
  stroke: boolean,
  name: string,
  yOffset: number
) => {
  const canvas = document.createElement("canvas");
  const r = 3;
  canvas.width = r * w;
  canvas.height = (r * h) / 10;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = color;
    context.lineWidth = 4;
    context.strokeStyle = "black";
    if (stroke) {
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeRect(0, 0, canvas.width, canvas.height);
    } else {
      context.fillRect(2, 2, canvas.width - 4, canvas.height - 4);
    }
  }
  const texture = new Texture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  const bar_material = new SpriteMaterial({ map: texture });
  const bar_sprite = new Sprite(bar_material);
  bar_sprite.position.set(w / 2, h * 1.58 - (yOffset * (canvas.height - 2)) / r, -5);
  bar_sprite.scale.set(canvas.width / r, canvas.height / r, 1);
  bar_sprite.name = name;
  bar_sprite.userData.full_width = w;
  return bar_sprite;
};

/**
 * Update status bar of a user sprite
 */
export const updateStatusBar = (userSpriteGroup: Group, perc: number) => {
  const bar = userSpriteGroup.getObjectByName("hp_current") as Sprite;
  const width = bar.userData.full_width as number;
  const newWidth = width * perc;
  const newPosition = width / 2 - (width * (1 - perc)) / 2;
  bar.scale.set(newWidth, bar.scale.y, 1);
  bar.position.set(newPosition, bar.position.y, bar.position.z);
};

/**
 * User sprite, which loads the avatar image and displays the health bar as a js sprite
 */
export const createUserSprite = (userData: DrawnCombatUser, hex: TerrainHex) => {
  // Group is used to group components of the user Marker
  const group = new Group();
  const { height: h, width: w } = hex;

  // Marker background in white
  const marker = new TextureLoader().load("map/userMarker.webp");
  const markerMat = new SpriteMaterial({ map: marker, alphaMap: marker });
  const markerSprite = new Sprite(markerMat);
  markerSprite.userData.type = "marker";
  markerSprite.scale.set(h, h * 1.2, 1);
  markerSprite.position.set(w / 2, h * 0.9, -6);
  group.add(markerSprite);

  // Avatar Sprite
  const alphaMap = new TextureLoader().load("map/userSpriteMask.webp");
  const map = new TextureLoader().load(userData.avatar || "");
  map.generateMipmaps = false;
  map.minFilter = LinearFilter;
  const material = new SpriteMaterial({ map: map, alphaMap: alphaMap });
  const sprite = new Sprite(material);
  sprite.scale.set(h * 0.8, h * 0.8, 1);
  sprite.position.set(w / 2, h * 1.0, -6);
  group.add(sprite);

  // Health bar is shown on all
  const hp_background = drawStatusBar(w, h, "gray", true, "hp_background", 0);
  const hp_bar = drawStatusBar(w, h, "firebrick", true, "hp_current", 0);
  group.add(hp_background);
  group.add(hp_bar);

  // Stamina Bar if available
  if ("cur_stamina" in userData && "max_stamina" in userData) {
    const sp_background = drawStatusBar(w, h, "gray", true, "sp_background", 1);
    const sp_bar = drawStatusBar(w, h, "green", true, "sp_current", 1);
    group.add(sp_background);
    group.add(sp_bar);
  }

  // Chakra Bar if available
  if ("cur_chakra" in userData && "max_chakra" in userData) {
    const cp_background = drawStatusBar(w, h, "gray", true, "cp_background", 2);
    const cp_bar = drawStatusBar(w, h, "blue", true, "cp_current", 2);
    group.add(cp_background);
    group.add(cp_bar);
  }

  // Name
  group.name = userData.userId;
  group.userData.type = "user";
  group.userData.userId = userData.userId;
  group.userData.hex = hex;

  return group;
};

/**
 * Draw/update the users on the map. Should be called on every render
 */
export const drawCombatUsers = (info: {
  group_users: Group;
  users: DrawnCombatUser[];
  grid: Grid<TerrainHex>;
}) => {
  // Draw the users
  const drawnIds = new Set<string>();
  info.users.forEach((user) => {
    const hex = findHex(info.grid, {
      x: user.longitude,
      y: user.latitude,
    });
    if (hex) {
      // Loop through the users in the group
      let userMesh = info.group_users.getObjectByName(user.userId);
      if (!userMesh && hex) {
        userMesh = createUserSprite(user, hex);
        info.group_users.add(userMesh);
      }
      // Get location
      if (userMesh && info.grid) {
        userMesh.visible = true;
        userMesh.userData.tile = hex;
        const { x, y } = hex.center;
        userMesh.position.set(-x, -y, 0);
        drawnIds.add(userMesh.name);
      }
    }
  });
  info.group_users.children.sort((a, b) => b.position.y - a.position.y);

  // Hide all user counters which are not used anymore
  info.group_users.children.forEach((object) => {
    if (!drawnIds.has(object.name)) {
      object.visible = false;
    }
  });
};
