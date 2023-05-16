import {
  Group,
  TextureLoader,
  SpriteMaterial,
  Sprite,
  Texture,
  LinearFilter,
  Color,
  type Event,
  type Object3D,
  type Raycaster,
} from "three";
import { AttackMethod, AttackTarget } from "@prisma/client";
import { spiral, line, ring, fromCoordinates } from "honeycomb-grid";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../travel/types";
import { COMBAT_SECONDS, COMBAT_PREMOVE_SECONDS } from "./constants";

import { type UserDataWithRelations } from "../../utils/UserContext";
import { showAnimation } from "./background";
import { findHex } from "../travel/sector";
import type { HexagonalFaceMesh } from "../travel/types";
import type {
  DrawnCombatUser,
  CombatAction,
  GroundEffect,
  ReturnedUserState,
} from "./types";
import type { BarrierTagType } from "./types";
import { secondsPassed } from "../../utils/time";
import type { UserBattle } from "../../utils/UserContext";
import type { SpriteMixer } from "../travel/SpriteMixer";

/**
 * Draw a status bar on user
 */
export const drawStatusBar = (
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
  bar_sprite.visible = false;
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
  if (perc === 0) {
    bar.visible = false;
  }
};

/**
 * User sprite, which loads the avatar image and displays the health bar as a js sprite
 */
export const createUserSprite = (userData: DrawnCombatUser, hex: TerrainHex) => {
  // If no health, no need
  if (userData.cur_health <= 0) return undefined;

  // Group is used to group components of the user Marker
  const group = new Group();
  const { height: h, width: w } = hex;

  // Highlight background in village color
  const highlightTexture = new TextureLoader().load("map/userMarker.webp");
  const highlightMaterial = new SpriteMaterial({
    map: highlightTexture,
    alphaMap: highlightTexture,
  });
  const highlightSprite = new Sprite(highlightMaterial);
  highlightSprite.userData.type = "marker";
  highlightSprite.scale.set(h, h * 1.2, 1);
  highlightSprite.position.set(w / 2, h * 0.9, -6);
  highlightSprite.userData.type = "userMarker";
  highlightSprite.userData.userId = userData.userId;
  highlightSprite.material.color.setHex(
    userData.village
      ? parseInt(userData.village.hexColor.replace("#", ""), 16)
      : 0x000000
  );
  group.add(highlightSprite);

  // Marker background in white
  const marker = new TextureLoader().load("map/userMarker.webp");
  const markerMat = new SpriteMaterial({ map: marker, alphaMap: marker });
  const markerSprite = new Sprite(markerMat);
  markerSprite.userData.type = "marker";
  markerSprite.scale.set(0.9 * h, h * 1.1, 1);
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

  // If this is the original and our user (we have SP/CP), then show a star
  if ("cur_stamina" in userData && userData.is_original) {
    const marker = new TextureLoader().load("combat/star.webp");
    const markerMat = new SpriteMaterial({ map: marker });
    const markerSprite = new Sprite(markerMat);
    markerSprite.scale.set(h / 2.5, h / 2.5, 1);
    markerSprite.position.set(w / 2, h * 0.4, -6);
    group.add(markerSprite);
  }

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

  // Create tombstone but hide it for now
  const tomb_texture = new TextureLoader().load("combat/tombstone.webp");
  const tomb_material = new SpriteMaterial({ map: tomb_texture });
  const tomb_sprite = new Sprite(tomb_material);
  tomb_sprite.name = "tombstone";
  tomb_sprite.scale.set(h * 0.5, h * 0.5, 1);
  tomb_sprite.position.set(w / 2, h * 0.6, -7);
  tomb_sprite.visible = false;
  group.add(tomb_sprite);

  // Name
  group.name = userData.userId;
  group.userData.type = "user";
  group.userData.userId = userData.userId;
  group.userData.hex = hex;

  return group;
};

/**
 * Sets the opacity of all children of an object
 */
export const setOpacity = (obj: Object3D<Event> | Group | Sprite, opacity: number) => {
  obj?.children.forEach((child) => {
    setOpacity(child, opacity);
  });
  if (obj && "material" in obj && obj?.material) {
    obj.material.opacity = opacity;
  }
};

/**
 * Sets the opacity of all children of an object
 */
export const setVisible = (obj: Object3D<Event> | Group | Sprite, visible: boolean) => {
  obj?.children.forEach((child) => {
    setVisible(child, visible);
  });
  if ("visible" in obj) {
    obj.visible = visible;
  }
};

/**
 * Draw/update the users on the map. Should be called on every render
 */
export const drawCombatUsers = (info: {
  group_users: Group;
  users: DrawnCombatUser[];
  grid: Grid<TerrainHex>;
  spriteMixer: ReturnType<typeof SpriteMixer>;
}) => {
  // Destruct
  const { users, group_users, grid, spriteMixer } = info;
  // Draw the users
  const drawnIds = new Set<string>();
  users.forEach((user) => {
    const hex = findHex(grid, {
      x: user.longitude,
      y: user.latitude,
    });
    if (hex) {
      // Fetch / create the user mesh
      let userMesh = group_users.getObjectByName(user.userId) as Group | undefined;
      if (!userMesh && hex) {
        userMesh = createUserSprite(user, hex);
        if (userMesh) group_users.add(userMesh);
      }
      // Get location
      if (userMesh && grid) {
        userMesh.visible = true;
        userMesh.userData.tile = hex;
        const { x, y } = hex.center;
        const { width } = hex;
        const { x: curX, y: curY } = userMesh.position;
        const speed = width / 50;
        let targetX = -x;
        let targetY = -y;
        if (curX !== 0 || curY !== 0) {
          const xDiff = targetX - curX;
          const yDiff = targetY - curY;
          if (xDiff) {
            const xToYratio = yDiff ? Math.abs(xDiff / yDiff) : 1;
            const deltaX = (xDiff > 0 ? 1 : -1) * speed * xToYratio;
            if (xDiff > 0) {
              targetX = curX + deltaX >= targetX ? targetX : curX + deltaX;
            } else {
              targetX = curX + deltaX <= targetX ? targetX : curX + deltaX;
            }
          }
          if (yDiff) {
            const deltaY = (targetY - curY > 0 ? 1 : -1) * speed;
            if (yDiff > 0) {
              targetY = curY + deltaY >= targetY ? targetY : curY + deltaY;
            } else {
              targetY = curY + deltaY <= targetY ? targetY : curY + deltaY;
            }
          }
        }
        userMesh.position.set(targetX, targetY, 0);
        // Handle remove users from combat.
        // TODO: Remove this to separate function, or make more clear this is where it happens
        if (user.cur_health <= 0 && !user.hidden) {
          // Hide user
          setVisible(userMesh, false);
          // Effect on death
          if (user.is_original) {
            const tombstone = userMesh.getObjectByName("tombstone") as Sprite;
            tombstone.visible = true;
          } else if (user.disappearAnimation) {
            console.log("POOF");
            console.log(user.disappearAnimation);
            const sprite = showAnimation(user.disappearAnimation, hex, spriteMixer);
            if (sprite) userMesh.add(sprite);
          }
          // Mark as hidden
          user.hidden = true;
        }
        // userMesh.material.color.offsetHSL(0, 0, 0.1);
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
  group_users.children.sort((a, b) => b.position.y - a.position.y);

  // Hide all user counters which are not used anymore
  group_users.children.forEach((object) => {
    if (!drawnIds.has(object.name)) {
      object.visible = false;
    }
  });
};

export const isValidMove = (info: {
  action: CombatAction;
  target: TerrainHex;
  user: DrawnCombatUser;
  users: DrawnCombatUser[];
  barriers: GroundEffect[];
}) => {
  const { action, user, users, target, barriers } = info;
  const { villageId, userId } = user;
  const barrier = barriers.find(
    (b) => b.longitude === target.col && b.latitude === target.row
  );
  if (!barrier) {
    const opponent = users.find(
      (u) => u.longitude === target.col && u.latitude === target.row && u.cur_health > 0
    );
    if (action.target === AttackTarget.CHARACTER) {
      if (opponent) return true;
    } else if (action.target === AttackTarget.OPPONENT) {
      if (opponent && opponent?.villageId !== villageId) return true;
    } else if (action.target === AttackTarget.OTHER_USER) {
      if (opponent && opponent?.userId !== userId) return true;
    } else if (action.target === AttackTarget.ALLY) {
      if (opponent && opponent?.villageId === villageId) return true;
    } else if (action.target === AttackTarget.SELF) {
      if (opponent && opponent?.userId === userId) return true;
    } else if (action.target === AttackTarget.EMPTY_GROUND) {
      if (!opponent) return true;
    } else if (action.target === AttackTarget.GROUND) {
      if (!(action.id === "move" && opponent)) {
        return true;
      }
    }
  } else {
    if (action.effects.find((e) => e.type === "damage")) {
      return true;
    }
  }

  return false;
};

export const actionSecondsAfterAction = (
  user: { updatedAt: string | Date },
  action: CombatAction
) => {
  const passed = Math.min(secondsPassed(new Date(user.updatedAt)), COMBAT_SECONDS);
  const timeCost = (action.actionCostPerc / 100) * COMBAT_SECONDS;
  return passed - timeCost;
};

export const getAffectedTiles = (info: {
  a: TerrainHex;
  b: TerrainHex;
  action: CombatAction;
  grid: Grid<TerrainHex>;
  users: DrawnCombatUser[];
  ground: GroundEffect[];
  userId: string;
}) => {
  // Destruct & variables
  const { action, b, a, grid, users, userId } = info;
  const radius = action.range;
  const green = new Set<TerrainHex>();
  const red = new Set<TerrainHex>();
  const user = users.find((u) => u.userId === userId);
  let tiles: Grid<TerrainHex> | undefined = undefined;

  // Get all ground effects which are barriers
  const barriers = info.ground.filter((g) => g.type === "barrier");

  // Guard if no user
  if (!user) return { green, red };

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
      if (isValidMove({ action, target, user, users, barriers })) {
        green.add(target);
      }
    });
  }

  // Return green for valid moves and red for unvalid moves
  tiles?.forEach((target) => {
    if (isValidMove({ action, target, user, users, barriers })) {
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
  user: ReturnedUserState;
  action: CombatAction | undefined;
  battle: UserBattle;
  grid: Grid<TerrainHex>;
  currentHighlights: Set<string>;
}) => {
  // Definitions
  const { group_tiles, user, battle, currentHighlights, action, grid } = info;
  const intersects = info.raycaster.intersectObjects(group_tiles.children);
  const users = battle.usersState;
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

  // Check if we have enough action points to perform action
  const canAct =
    user && action && actionSecondsAfterAction(user, action) >= -COMBAT_PREMOVE_SECONDS;
  const hit = intersects.length > 0 && intersects[0];

  // Highlight intersected tile
  /* ************************** */
  const newSelection = new Set<string>();
  if (action && origin && highlights && hit && canAct) {
    const intersected = hit.object as HexagonalFaceMesh;
    const targetTile = intersected.userData.tile;
    // Based on the intersected tile, highlight the tiles which are affected.
    const { green, red } = getAffectedTiles({
      a: origin,
      b: targetTile,
      action,
      grid: highlights,
      ground: battle.groundEffects,
      userId: user.userId,
      users,
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

    // Set cursor type on highlight
    if (
      (document.body.style.cursor === "default" || document.body.style.cursor === "") &&
      green.size > 0
    ) {
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

/**
 * Highlight possible squares based on action
 */
export const highlightUsers = (info: {
  group_tiles: Group;
  group_users: Group;
  raycaster: Raycaster;
  userId: string;
  users: DrawnCombatUser[];
  currentHighlights: Set<string>;
}) => {
  // Definitions
  const { group_tiles, group_users, users, userId, currentHighlights } = info;
  const intersects = info.raycaster.intersectObjects(group_tiles.children);
  const hit = intersects.length > 0 && intersects[0];
  const newSelection = new Set<string>();
  if (hit) {
    const intersected = hit.object as HexagonalFaceMesh;
    const targetTile = intersected.userData.tile;
    const target = users.find(
      (u) =>
        u.longitude === targetTile.col &&
        u.latitude === targetTile.row &&
        u.cur_health > 0
    );
    if (target) {
      const userMesh = group_users.getObjectByName(target.userId) as Group;
      if (userMesh) {
        setStatusBarVisibility(userMesh, true);
        newSelection.add(target.userId);
      }
    }
  }
  // The active userId we always show status bars
  const userMesh = group_users.getObjectByName(userId) as Group;
  if (userMesh) {
    setStatusBarVisibility(userMesh, true);
    newSelection.add(userId);
  }
  // Remove highlights from tiles that are no longer in the path
  currentHighlights.forEach((name) => {
    if (!newSelection.has(name)) {
      const userMesh = group_users.getObjectByName(name) as Group;
      if (userMesh) setStatusBarVisibility(userMesh, false);
    }
  });
  return newSelection;
};

export const setStatusBarVisibility = (userMesh: Group, visible: boolean) => {
  const hp_background = userMesh.getObjectByName("hp_background") as Sprite;
  if (hp_background) {
    hp_background.visible = visible;
  }
  const hp_current = userMesh.getObjectByName("hp_current") as Sprite;
  if (hp_current) {
    hp_current.visible = visible;
  }
  const sp_background = userMesh.getObjectByName("sp_background") as Sprite;
  if (sp_background) {
    sp_background.visible = visible;
  }
  const sp_current = userMesh.getObjectByName("sp_current") as Sprite;
  if (sp_current) {
    sp_current.visible = visible;
  }
  const cp_background = userMesh.getObjectByName("cp_background") as Sprite;
  if (cp_background) {
    cp_background.visible = visible;
  }
  const cp_current = userMesh.getObjectByName("cp_current") as Sprite;
  if (cp_current) {
    cp_current.visible = visible;
  }
};

/**
 * Highlight different things in the environment based on raycaster
 */
export const highlightTooltips = (info: {
  group_ground: Group;
  raycaster: Raycaster;
  battle: UserBattle;
  currentTooltips: Set<string>;
}) => {
  // Definitions
  const { group_ground, battle, currentTooltips } = info;
  const intersects = info.raycaster.intersectObjects(group_ground.children);
  const newTooltips = new Set<string>();

  // Barriers
  const barrier = intersects.find((i) => i.object.parent?.userData.type === "barrier")
    ?.object.parent;
  if (barrier) {
    // Get the sprites
    const background = barrier.getObjectByName("hp_background") as Sprite;
    const bar = barrier.getObjectByName("hp_current") as Sprite;
    background.visible = true;
    bar.visible = true;
    // Update HP of barrier
    const effect = battle.groundEffects.find((e) => e.id === barrier.name);
    if (effect) {
      const typedEffect = effect as unknown as BarrierTagType;
      updateStatusBar(
        "hp_current",
        barrier as Group,
        typedEffect.power / typedEffect.originalPower
      );
    }
    // Remember that we drew this
    newTooltips.add(barrier.name);
  }

  // Remove highlights from tiles that are no longer in the path
  currentTooltips.forEach((name) => {
    if (!newTooltips.has(name)) {
      const mesh = group_ground.getObjectByName(name) as Group;
      const background = mesh.getObjectByName("hp_background") as Sprite;
      const bar = mesh.getObjectByName("hp_current") as Sprite;
      background.visible = false;
      bar.visible = false;
    }
  });
  return newTooltips;
};
