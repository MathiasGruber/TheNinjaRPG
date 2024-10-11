import {
  BufferGeometry,
  BufferAttribute,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LinearFilter,
  Line,
  MeshBasicMaterial,
  Mesh,
  SpriteMaterial,
  Sprite,
} from "three";
import { loadTexture, createTexture } from "@/libs/threejs/util";
import { getPossibleActionTiles, findHex } from "../hexgrid";
import { COMBAT_WIDTH } from "./constants";
import { getAffectedTiles } from "./movement";
import { actionPointsAfterAction } from "./actions";
import { calcActiveUser } from "./actions";
import { stillInBattle } from "./actions";
import { getBattleGrid } from "@/libs/combat/util";
import {
  IMG_SECTOR_USER_MARKER,
  IMG_SECTOR_USER_SPRITE_MASK,
  IMG_SECTOR_SHADOW,
} from "@/drizzle/constants";
import type { GameAsset } from "@/drizzle/schema";
import type { Grid } from "honeycomb-grid";
import type { Scene, Object3D, Raycaster } from "three";
import type { TerrainHex, HexagonalFaceMesh } from "../hexgrid";
import type { GroundEffect, UserEffect, BarrierTagType } from "./types";
import type { ReturnedUserState, CombatAction } from "./types";
import type { ReturnedBattle } from "./types";
import type { SpriteMixer } from "../threejs/SpriteMixer";

/**
 * Show animation on the hex
 */
export const showAnimation = (
  animation: GameAsset,
  hex: TerrainHex,
  spriteMixer: ReturnType<typeof SpriteMixer>,
  playInfinite = false,
) => {
  const { height: h, width: w } = hex;
  const texture = loadTexture(animation.image);
  const actionSprite = spriteMixer.ActionSprite(texture, 1, animation.frames);
  const action = spriteMixer.Action(actionSprite, 0, animation.frames, animation.speed);
  if (action) {
    action.hideWhenFinished = true;
    if (playInfinite) {
      action.playLoop();
    } else {
      action.playOnce();
    }
  }
  actionSprite.scale.set(50, 50, 1);
  actionSprite.position.set(w / 2, h / 2, 5);
  return actionSprite;
};

/**
 * Creates heaxognal grid & draw it using js. Return groups of objects drawn
 */
export const drawCombatBackground = (
  width: number,
  height: number,
  scene: Scene,
  background: string,
) => {
  // Set scene background
  const bg_texture = loadTexture(`/locations/${background}`);
  const bg_material = new SpriteMaterial({ map: bg_texture });
  const bg_sprite = new Sprite(bg_material);
  bg_sprite.scale.set(width, height, 1);
  bg_sprite.position.set(width / 2, height / 2, -10);
  scene.add(bg_sprite);

  // Padding for the tiles [in % of width/height]
  const leftPadding = 0.11 * width;
  const bottomPadding = 0.1 * height;

  // Calculate hex size
  const stackingDisplacement = 1.31;
  const hexsize = (width / COMBAT_WIDTH / 2.6) * stackingDisplacement;

  // Groups for organizing objects
  const group_tiles = new Group();
  const group_edges = new Group();

  // Create the grid first
  const honeycombGrid = getBattleGrid(hexsize, {
    x: -hexsize - leftPadding,
    y: -hexsize - bottomPadding,
  });

  // Hex points
  const points = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];

  // Line material to use for edges
  const lineMaterial = new LineBasicMaterial({ color: 0x000000 });
  const material = new MeshBasicMaterial({
    color: 0x000000,
    opacity: 0.1,
    transparent: true,
  });
  // Draw the tiles
  honeycombGrid.forEach((tile) => {
    if (tile) {
      // Draw the tile
      const geometry = new BufferGeometry();
      const corners = tile.corners;
      const vertices = new Float32Array(
        points.map((p) => corners[p]).flatMap((p) => (p ? [p.x, p.y, -10] : [])),
      );
      geometry.setAttribute("position", new BufferAttribute(vertices, 3));
      const mesh = new Mesh(geometry, material?.clone());
      mesh.name = `${tile.row},${tile.col}`;
      mesh.userData.type = "tile";
      mesh.userData.tile = tile;
      mesh.userData.hex = material?.color.getHex();
      mesh.userData.highlight = false;
      mesh.userData.selected = false;
      mesh.userData.canClick = false;
      mesh.matrixAutoUpdate = false;
      group_tiles.add(mesh);

      // Draw the edges
      const edges = new EdgesGeometry(geometry);
      edges.translate(0, 0, 1);
      const edgeMesh = new Line(edges, lineMaterial);
      edgeMesh.matrixAutoUpdate = false;
      group_edges.add(edgeMesh);

      // Draw any objects on the tiles based on randomness
      // const sprites = getMapSprites(prng, 1, "combat", tile, 0);
      // sprites.map((sprite) => group_assets.add(sprite));
    }
  });

  // Reverse the order of objects in the group_assets
  // group_assets.children.sort((a, b) => b.position.y - a.position.y);

  return { group_tiles, group_edges, honeycombGrid };
};

/**
 * Draw/update the users on the map. Should be called on every render
 */
export const drawCombatEffects = (info: {
  groupGround: Group;
  battle: ReturnedBattle;
  grid: Grid<TerrainHex>;
  animationId: number;
  spriteMixer: ReturnType<typeof SpriteMixer>;
  gameAssets: GameAsset[];
}) => {
  // Destructure
  const { battle, groupGround, spriteMixer, animationId, gameAssets } = info;
  const { groundEffects, usersEffects, usersState } = battle;

  // Record of drawn IDs
  const drawnIds = new Set<string>();

  // Draw the ground effects
  groundEffects.forEach((effect) => {
    const hex = findHex(info.grid, {
      x: effect.longitude,
      y: effect.latitude,
    });
    drawCombatEffect({
      groupGround,
      effect,
      animationId,
      hex,
      spriteMixer,
      drawnIds,
      gameAssets,
    });
  });
  // Draw all user effects
  usersEffects.forEach((effect) => {
    const user = usersState.find((u) => u.userId === effect.targetId);
    if (user && stillInBattle(user)) {
      const hex = findHex(info.grid, {
        x: user.longitude,
        y: user.latitude,
      });
      drawCombatEffect({
        groupGround,
        effect,
        animationId,
        hex,
        spriteMixer,
        drawnIds,
        gameAssets,
      });
    }
  });

  // Hide all which are not used anymore
  groupGround.children.forEach((object) => {
    if (!drawnIds.has(object.name)) {
      object.visible = false;
    }
  });
};

export const drawCombatEffect = (info: {
  groupGround: Group;
  effect: GroundEffect | UserEffect;
  animationId: number;
  hex?: TerrainHex;
  spriteMixer: ReturnType<typeof SpriteMixer>;
  drawnIds: Set<string>;
  gameAssets: GameAsset[];
}) => {
  // Destructure
  const { effect, groupGround, animationId, hex, drawnIds } = info;
  const { spriteMixer, gameAssets } = info;
  if (hex) {
    if (effect.staticAssetPath || effect.appearAnimation || effect.disappearAnimation) {
      const { height: h, width: w } = hex;
      let asset = groupGround.getObjectByName(effect.id) as Group;
      if (!asset) {
        // Group for the asset
        asset = new Group();
        asset.name = effect.id;
        asset.userData.type = effect.type; // e.g. "barrier"
        // Sprite to show
        if (effect.staticAssetPath) {
          const obj = gameAssets.find((a) => a.id === effect.staticAssetPath);
          console.log("obj", obj);
          if (obj) {
            const texture = loadTexture(obj.image);
            const material = new SpriteMaterial({ map: texture });
            const sprite = new Sprite(material);
            sprite.scale.set(w, h, 1);
            sprite.position.set(w / 2, h / 2, 0);
            asset.add(sprite);
          }
        }
        // If there is an appear animation, show it. Mark it for hiding,
        // which we catch and use to remove it
        if (effect.appearAnimation && animationId !== 0) {
          const obj = gameAssets.find((a) => a.id === effect.appearAnimation);
          if (obj) {
            const actionSprite = showAnimation(obj, hex, spriteMixer);
            if (actionSprite) asset.add(actionSprite);
          }
        }
        // If there is a static animation, show it.
        if (effect.staticAnimation) {
          const obj = gameAssets.find((a) => a.id === effect.staticAnimation);
          if (obj) {
            const actionSprite = showAnimation(obj, hex, spriteMixer, true);
            if (actionSprite) asset.add(actionSprite);
          }
        }
        // Status bar
        if (effect.type === "barrier") {
          const hp_background = drawStatusBar(w, h, "gray", true, "hp_background", 0);
          const hp_bar = drawStatusBar(w, h, "firebrick", true, "hp_current", 0);
          asset.add(hp_background);
          asset.add(hp_bar);
          hp_bar.position.set(w / 2, h, 0);
          hp_background.position.set(w / 2, h, 0);
          hp_bar.visible = false;
          hp_background.visible = false;
        }
        // Add to group
        groupGround.add(asset);
      }

      // Set visibility
      if (asset) {
        if (effect.power !== undefined && effect.power <= 0) {
          asset.visible = false;
        } else {
          asset.visible = true;
          asset.userData.tile = hex;
          const { x, y } = hex.center;
          asset.position.set(-x, -y, -8);
          drawnIds.add(asset.name);
        }
      }
    }
  }
};

/**
 * Draw a status bar on user
 */
export const drawStatusBar = (
  w: number,
  h: number,
  color: string,
  stroke: boolean,
  name: string,
  yOffset: number,
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
  const texture = createTexture(canvas);
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
  const bar = userSpriteGroup.getObjectByName(name);
  if (bar) {
    const width = bar.userData.full_width as number;
    const newWidth = width * perc;
    const newPosition = width / 2 - (width * (1 - perc)) / 2;
    bar.scale.set(newWidth, bar.scale.y, 1);
    bar.position.set(newPosition, bar.position.y, bar.position.z);
    if (perc === 0) {
      bar.visible = false;
    }
  }
};

/**
 * User sprite, which loads the avatar image and displays the health bar as a js sprite
 */
export const createUserSprite = (userData: ReturnedUserState, hex: TerrainHex) => {
  // If not there, nope
  if (userData.curHealth <= 0 || userData.fledBattle) return undefined;

  // Group is used to group components of the user Marker
  const group = new Group();
  const { height: h, width: w } = hex;

  // Shadow
  const texture = loadTexture(IMG_SECTOR_SHADOW);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  const shadow_material = new SpriteMaterial({ map: texture });
  const shadow_sprite = new Sprite(shadow_material);
  shadow_sprite.scale.set(w * 0.7, h * 0.4, 1);
  shadow_sprite.position.set(w / 2, h * 0.3, -6);
  group.add(shadow_sprite);

  // User marker background or raw image
  const noMarker = userData.isAi && userData.isOriginal;
  if (noMarker) {
    const map = loadTexture(userData.avatar ? `${userData.avatar}?1=1` : "");
    map.generateMipmaps = false;
    map.minFilter = LinearFilter;
    if (userData.direction === "right") {
      map.repeat.set(-1, 1);
      map.offset.set(1, 0);
    }
    const material = new SpriteMaterial({ map: map });
    material.side = DoubleSide;
    const sprite = new Sprite(material);
    sprite.scale.set(-1 * h * 0.8, h * 0.8, 1);
    sprite.position.set(w / 2, h * 0.6, -6);
    group.add(sprite);
  } else {
    // Highlight background in village color
    const highlightTexture = loadTexture(IMG_SECTOR_USER_MARKER);
    const highlightMaterial = new SpriteMaterial({
      map: highlightTexture,
      alphaMap: highlightTexture,
    });

    // Highlight sprite
    const highlightColor = userData.village
      ? parseInt(userData.village.hexColor.replace("#", ""), 16)
      : 0x000000;
    const highlightSprite = new Sprite(highlightMaterial);
    highlightSprite.userData.type = "marker";
    highlightSprite.scale.set(h, h * 1.2, 1);
    highlightSprite.position.set(w / 2, h * 0.9, -6);
    highlightSprite.userData.type = "userMarker";
    highlightSprite.userData.userId = userData.userId;
    highlightSprite.material.color.setHex(highlightColor);
    group.add(highlightSprite);

    // Marker background in white
    const marker = loadTexture(IMG_SECTOR_USER_MARKER);
    const markerMat = new SpriteMaterial({ map: marker, alphaMap: marker });
    const markerSprite = new Sprite(markerMat);
    markerSprite.userData.type = "marker";
    markerSprite.scale.set(0.9 * h, h * 1.1, 1);
    markerSprite.position.set(w / 2, h * 0.9, -6);
    group.add(markerSprite);

    // Avatar Sprite
    const alphaMap = loadTexture(IMG_SECTOR_USER_SPRITE_MASK);
    const map = loadTexture(userData.avatar ? `${userData.avatar}?1=1` : "");
    map.generateMipmaps = false;
    map.minFilter = LinearFilter;
    const material = new SpriteMaterial({ map: map, alphaMap: alphaMap });
    const sprite = new Sprite(material);
    sprite.scale.set(h * 0.8, h * 0.8, 1);
    sprite.position.set(w / 2, h * 1.0, -6);
    group.add(sprite);

    // Clan if it is there
    if (userData.clan?.image) {
      const clanTexture = loadTexture(userData.clan.image);
      const clanBorderMaterial = new SpriteMaterial({
        map: alphaMap,
        alphaMap: alphaMap,
      });
      const clanBorderSprite = new Sprite(clanBorderMaterial);
      clanBorderSprite.material.color.setHex(parseInt("FFD700", 16));
      clanBorderSprite.scale.set(-1 * h * 0.3 - 2, h * 0.3 + 2, 1);
      clanBorderSprite.position.set(0.9 * w, h * 1.4, -6);
      group.add(clanBorderSprite);
      const clanMaterial = new SpriteMaterial({ map: clanTexture, alphaMap: alphaMap });
      const clanSprite = new Sprite(clanMaterial);
      clanSprite.scale.set(-1 * h * 0.3, h * 0.3, 1);
      clanSprite.position.set(0.9 * w, h * 1.4, -6);
      group.add(clanSprite);
    }
  }

  // If this is the original and our user (we have SP/CP), then show a star
  if ("curStamina" in userData && userData.isOriginal && !userData.isAi) {
    const marker = loadTexture("/combat/star.webp");
    const markerMat = new SpriteMaterial({ map: marker });
    const markerSprite = new Sprite(markerMat);
    markerSprite.scale.set(h / 2.5, h / 2.5, 1);
    markerSprite.position.set(w / 2, h * 0.4, -6);
    group.add(markerSprite);
  }

  // Health bar is shown on all
  const t = noMarker ? h / 8 : 0;
  const hp_background = drawStatusBar(w, h, "gray", true, "hp_background", t);
  const hp_bar = drawStatusBar(w, h, "firebrick", true, "hp_current", t);
  group.add(hp_background);
  group.add(hp_bar);

  // Stamina Bar if available
  if ("curStamina" in userData && "maxStamina" in userData) {
    const sp_background = drawStatusBar(w, h, "gray", true, "sp_background", t + 1);
    const sp_bar = drawStatusBar(w, h, "green", true, "sp_current", t + 1);
    group.add(sp_background);
    group.add(sp_bar);
  }

  // Chakra Bar if available
  if ("curChakra" in userData && "maxChakra" in userData) {
    const cp_background = drawStatusBar(w, h, "gray", true, "cp_background", t + 2);
    const cp_bar = drawStatusBar(w, h, "blue", true, "cp_current", t + 2);
    group.add(cp_background);
    group.add(cp_bar);
  }

  // Create tombstone but hide it for now
  const tomb_texture = loadTexture("/combat/tombstone.webp");
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
export const setOpacity = (obj: Object3D | Group | Sprite, opacity: number) => {
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
export const setVisible = (obj: Object3D | Group | Sprite, visible: boolean) => {
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
  users: ReturnedUserState[];
  grid: Grid<TerrainHex>;
}) => {
  // Destruct
  const { users, group_users, grid } = info;
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
        if (!stillInBattle(user) && user.hidden === undefined) {
          setVisible(userMesh, false);
          if (user.isOriginal) {
            const tombstone = userMesh.getObjectByName("tombstone") as Sprite;
            tombstone.visible = true;
          }
          user.hidden = true;
        }
        // userMesh.material.color.offsetHSL(0, 0, 0.1);
        updateStatusBar("hp_current", userMesh, user.curHealth / user.maxHealth);
        if (user.curStamina && user.maxStamina) {
          updateStatusBar("sp_current", userMesh, user.curStamina / user.maxStamina);
        }
        if (user.curChakra && user.maxChakra) {
          updateStatusBar("cp_current", userMesh, user.curChakra / user.maxChakra);
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

/**
 * Highlight possible squares based on action
 */
export const highlightTiles = (info: {
  group_tiles: Group;
  raycaster: Raycaster;
  user: ReturnedUserState;
  timeDiff: number;
  action: CombatAction | undefined;
  battle: ReturnedBattle;
  grid: Grid<TerrainHex>;
  currentHighlights: Set<string>;
}) => {
  // Definitions
  const { group_tiles, user, battle, currentHighlights, action, grid, timeDiff } = info;
  const intersects = info.raycaster.intersectObjects(group_tiles.children);
  const hit = intersects.length > 0 && intersects[0];
  const users = battle.usersState;
  const origin = user && grid.getHex({ col: user.longitude, row: user.latitude });

  // Make sure the proper round & activeUser is shown when we draw combat
  const { actor } = calcActiveUser(battle, user.userId, timeDiff);

  // Check if we have enough action points to perform action
  const { canAct } = actionPointsAfterAction(user, battle, action);
  const canUseTile = actor.userId === user.userId && canAct;

  // Highlight fields on the map where action can be applied
  const newHighlights = new Set<string>();
  const highlights = getPossibleActionTiles(action, origin, grid);

  if (highlights && canUseTile) {
    highlights.forEach((tile) => {
      if (tile) {
        const mesh = group_tiles.getObjectByName(
          `${tile.row},${tile.col}`,
        ) as HexagonalFaceMesh;
        if (mesh.userData.highlight === false) {
          mesh.userData.highlight = true;
          mesh.material.opacity = 0.3;
        }
        newHighlights.add(mesh.name);
      }
    });
  }

  // Check if cooldown for action has expired
  const isAvailable =
    !action?.cooldown ||
    !action?.lastUsedRound ||
    battle.round - action.lastUsedRound >= action.cooldown;

  // Is this a move action (if so, we color the selected green tile blue instead)
  const hasMove = action?.effects?.find((e) => e.type === "move");

  // Highlight intersected tile
  /* ************************** */
  const newSelection = new Set<string>();
  if (action && origin && highlights && hit && canUseTile && isAvailable) {
    const intersected = hit.object as HexagonalFaceMesh;
    const targetTile = intersected.userData.tile;
    // Based on the intersected tile, highlight the tiles which are affected.
    const { green, red } = getAffectedTiles({
      a: origin,
      b: targetTile,
      action,
      grid: grid,
      restrictGrid: highlights,
      ground: battle.groundEffects,
      userId: user.userId,
      users,
    });
    // Is the target in the highlights?
    const isAvailable =
      highlights.filter((h) => h === targetTile).size > 0 && !red.has(targetTile);
    // Highlight the tiles in different colors
    green.forEach((tile) => {
      const name = `${tile.row},${tile.col}`;
      const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
      mesh.userData.selected = true;
      mesh.userData.canClick = true;
      if (hasMove && tile === targetTile) {
        mesh.material.color = new Color("rgb(0, 0, 255)");
      } else {
        mesh.material.color = new Color("rgb(0, 255, 0)");
      }

      newSelection.add(name);
    });
    red.forEach((tile) => {
      const name = `${tile.row},${tile.col}`;
      const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
      mesh.userData.selected = true;
      mesh.userData.canClick = false;
      mesh.material.color = new Color("rgb(255, 0, 0)");
      newSelection.add(name);
    });
    // Set cursor type on highlight
    if (
      (document.body.style.cursor === "default" || document.body.style.cursor === "") &&
      green.size > 0 &&
      isAvailable
    ) {
      document.body.style.cursor = "pointer";
    } else if (
      document.body.style.cursor === "pointer" &&
      (green.size === 0 || isAvailable === false)
    ) {
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
  users: ReturnedUserState[];
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
        u.curHealth > 0 &&
        u.fledBattle === false,
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
  battle: ReturnedBattle;
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
        typedEffect.curHealth / typedEffect.maxHealth,
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
