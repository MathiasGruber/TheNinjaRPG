import {
  Group,
  TextureLoader,
  SpriteMaterial,
  Sprite,
  Texture,
  LinearFilter,
  Color,
  type Raycaster,
} from "three";
import { AttackMethod, AttackTarget } from "@prisma/client";
import { Grid, spiral, line, ring, fromCoordinates } from "honeycomb-grid";
import type { TerrainHex } from "../travel/types";

import { findHex } from "../travel/sector";
import type { HexagonalFaceMesh } from "../travel/types";
import type { DrawnCombatUser, CombatAction } from "./types";

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
export const updateStatusBar = (name: string, userSpriteGroup: Group, perc: number) => {
  const bar = userSpriteGroup.getObjectByName(name) as Sprite;
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
      // Fetch / create the user mesh
      let userMesh = info.group_users.getObjectByName(user.userId) as Group;
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
        updateStatusBar("hp_current", userMesh, user.cur_health / user.max_health);
        if (user.cur_stamina && user.max_stamina) {
          updateStatusBar("sp_current", userMesh, user.cur_stamina / user.max_stamina);
        }
        if (user.cur_chakra && user.max_chakra) {
          updateStatusBar("cp_current", userMesh, user.cur_chakra / user.max_chakra);
        }

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

export const isValidMove = (info: {
  action: CombatAction;
  target: TerrainHex;
  userId: string;
  users: DrawnCombatUser[];
}) => {
  const { action, userId, users, target } = info;
  const opponent = users.find(
    (u) => u.longitude === target.col && u.latitude === target.row
  );
  if (action.target === AttackTarget.CHARACTER) {
    if (opponent) return true;
  } else if (action.target === AttackTarget.OPPONENT) {
    if (opponent && opponent?.userId !== userId) return true;
  } else if (action.target === AttackTarget.SELF) {
    if (opponent && opponent?.userId === userId) return true;
  } else if (action.target === AttackTarget.GROUND) {
    if (!(action.id === "move" && opponent)) {
      return true;
    }
  }
  return false;
};

export const getAffectedTiles = (info: {
  a: TerrainHex;
  b: TerrainHex;
  action: CombatAction;
  grid: Grid<TerrainHex>;
  users: DrawnCombatUser[];
  userId: string;
}) => {
  // Destruct & variables
  const { action, b, a, grid, users, userId } = info;
  const radius = action.range;
  const green = new Set<TerrainHex>();
  const red = new Set<TerrainHex>();
  let tiles: Grid<TerrainHex> | undefined = undefined;

  // Handle different methods separately
  if (action.method === AttackMethod.SINGLE) {
    tiles = grid.traverse(fromCoordinates<TerrainHex>([b.q, b.r]));
  } else if (action.method === AttackMethod.AOE_CIRCLE_SPAWN) {
    tiles = grid.traverse(spiral<TerrainHex>({ start: [b.q, b.r], radius: 1 }));
  } else if (action.method === AttackMethod.AOE_LINE_SHOOT) {
    tiles = grid.traverse(line<TerrainHex>({ start: [b.q, b.r], stop: [a.q, a.r] }));
  } else if (action.method === AttackMethod.AOE_CIRCLE_SHOOT) {
    tiles = grid.traverse(ring<TerrainHex>({ center: [a.q, a.r], radius }));
  } else if (action.method === AttackMethod.AOE_SPIRAL_SHOOT) {
    tiles = grid.traverse(spiral<TerrainHex>({ start: [a.q, a.r], radius }));
    if (tiles) tiles = tiles.filter((t) => t !== a);
  } else if (action.method === AttackMethod.ALL) {
    grid.forEach((target) => {
      if (isValidMove({ action, target, userId, users })) {
        green.add(target);
      }
    });
  }

  // Return green for valid moves and red for unvalid moves
  tiles?.forEach((target) => {
    if (isValidMove({ action, target, userId, users })) {
      green.add(target);
    } else {
      red.add(target);
    }
  });
  return { green, red };
};

/**
 * Highlight possible squares based on action
 */
export const highlightTiles = (info: {
  group_tiles: Group;
  raycaster: Raycaster;
  grid: Grid<TerrainHex>;
  action: CombatAction | null;
  userId: string;
  users: DrawnCombatUser[];
  currentHighlights: Set<string>;
}) => {
  // Definitions
  const { group_tiles, userId, users, currentHighlights, action, grid } = info;
  const intersects = info.raycaster.intersectObjects(group_tiles.children);
  const user = users.find((u) => u.userId === userId);
  const origin = user && grid.getHex({ col: user.longitude, row: user.latitude });

  // Highlight fields on the map where action can be applied
  const newHighlights = new Set<string>();
  let highlights: Grid<TerrainHex> | undefined = undefined;
  if (action && origin) {
    const radius = action.range;
    if (
      action.method === AttackMethod.SINGLE ||
      action.method === AttackMethod.AOE_LINE_SHOOT ||
      action.method === AttackMethod.AOE_CIRCLE_SHOOT ||
      action.method === AttackMethod.AOE_SPIRAL_SHOOT
    ) {
      const f = spiral<TerrainHex>({ start: [origin.q, origin.r], radius: radius });
      highlights = grid.traverse(f);
    } else if (action.method === AttackMethod.ALL) {
      highlights = grid.forEach((hex) => hex);
    } else if (action.method === AttackMethod.AOE_CIRCLE_SPAWN) {
      const f = spiral<TerrainHex>({ start: [origin.q, origin.r], radius: radius + 1 });
      highlights = grid.traverse(f);
    }
    // Highlight tiles
    if (highlights) {
      highlights.forEach((tile) => {
        if (tile) {
          const mesh = group_tiles.getObjectByName(
            `${tile.row},${tile.col}`
          ) as HexagonalFaceMesh;
          if (mesh.userData.highlight === false) {
            mesh.userData.highlight = true;
            mesh.material.opacity = 0.3;
          }
          newHighlights.add(mesh.name);
        }
      });
    }
  }

  // Highlight intersected tile
  const newSelection = new Set<string>();
  if (action && origin && highlights && intersects.length > 0 && intersects[0]) {
    const intersected = intersects[0].object as HexagonalFaceMesh;
    const targetTile = intersected.userData.tile;

    // Based on the intersected tile, highlight the tiles which are affected.
    const { green, red } = getAffectedTiles({
      a: origin,
      b: targetTile,
      action,
      grid: highlights,
      users,
      userId,
    });

    // Highlight the tiles in different colors
    green.forEach((tile) => {
      const name = `${tile.row},${tile.col}`;
      const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
      mesh.userData.selected = true;
      mesh.userData.canClick = true;
      mesh.material.color = new Color("rgb(0, 255, 0)");
      newSelection.add(name);
    });
    red.forEach((tile) => {
      const name = `${tile.row},${tile.col}`;
      const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
      mesh.userData.selected = true;
      mesh.material.color = new Color("rgb(255, 0, 0)");
      newSelection.add(name);
    });
    if (document.body.style.cursor === "default" && green.size > 0) {
      document.body.style.cursor = "pointer";
    } else if (document.body.style.cursor === "pointer" && green.size === 0) {
      document.body.style.cursor = "default";
    }
  }

  // Remove highlights from tiles that are no longer in the path
  currentHighlights.forEach((name) => {
    if (!newHighlights.has(name)) {
      const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
      mesh.userData.highlight = false;
      mesh.material.opacity = 0.1;
    }
    if (!newSelection.has(name)) {
      const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
      mesh.userData.selected = false;
      mesh.userData.canClick = false;
      mesh.material.color.setHex(mesh.userData.hex);
    }
  });
  return new Set([...newHighlights, ...newSelection]);
};
