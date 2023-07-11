import {
  BufferGeometry,
  BufferAttribute,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LinearFilter,
  Line,
  MeshBasicMaterial,
  Mesh,
  SpriteMaterial,
  Sprite,
  TextureLoader,
  Texture,
} from "three";
import type { Scene, Object3D, Event, Raycaster } from "three";
import { Orientation, Grid, rectangle } from "honeycomb-grid";
import { getPossibleActionTiles, findHex, defineHex } from "../hexgrid";
import { Animations } from "./types";
import { COMBAT_HEIGHT, COMBAT_WIDTH, COMBAT_PREMOVE_SECONDS } from "./constants";
import { actionSecondsAfterAction, getAffectedTiles } from "./movement";
import type { TerrainHex, HexagonalFaceMesh } from "../hexgrid";
import type { GroundEffect, BarrierTagType } from "./types";
import type { ReturnedUserState, CombatAction } from "./types";
import type { UserBattle } from "../../utils/UserContext";
import type { SpriteMixer } from "../threejs/SpriteMixer";

/**
 * Show animation on the hex
 */
export const showAnimation = (
  appearAnimation: string,
  hex: TerrainHex,
  spriteMixer: ReturnType<typeof SpriteMixer>,
  playInfinite = false
) => {
  const info = Animations.get(appearAnimation);
  if (info) {
    const { height: h, width: w } = hex;
    const texture = new TextureLoader().load(`/animations/${appearAnimation}.png`);
    const actionSprite = spriteMixer.ActionSprite(texture, 1, info.frames);
    const action = spriteMixer.Action(actionSprite, 0, info.frames, info.speed);
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
  } else {
    console.error("No such animation: ", appearAnimation);
  }
};

/**
 * Creates heaxognal grid & draw it using js. Return groups of objects drawn
 */
export const drawCombatBackground = (
  width: number,
  height: number,
  scene: Scene,
  background: string
) => {
  // Set scene background
  const bg_texture = new TextureLoader().load(`/locations/${background}`);
  const bg_material = new SpriteMaterial({ map: bg_texture });
  const bg_sprite = new Sprite(bg_material);
  bg_sprite.scale.set(width, height, 1);
  bg_sprite.position.set(width / 2, height / 2, -10);
  scene.add(bg_sprite);

  // Padding for the tiles [in % of width/height]
  const leftPadding = 0.025 * width;
  const bottomPadding = 0.05 * height;

  // Calculate hex size
  const stackingDisplacement = 1.31;
  const hexsize = (width / COMBAT_WIDTH / 2.1) * stackingDisplacement;

  // Groups for organizing objects
  const group_tiles = new Group();
  const group_edges = new Group();

  // Create the grid first
  const Tile = defineHex({
    dimensions: hexsize,
    origin: { x: -hexsize - leftPadding, y: -hexsize - bottomPadding },
    orientation: Orientation.FLAT,
  });
  const honeycombGrid = new Grid(
    Tile,
    rectangle({ width: COMBAT_WIDTH, height: COMBAT_HEIGHT })
  ).map((tile) => {
    tile.cost = 1;
    return tile;
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
        points.map((p) => corners[p]).flatMap((p) => (p ? [p.x, p.y, -10] : []))
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
  group_ground: Group;
  effects: GroundEffect[];
  grid: Grid<TerrainHex>;
  animationId: number;
  spriteMixer: ReturnType<typeof SpriteMixer>;
}) => {
  // Destructure
  const { effects, group_ground, spriteMixer, animationId } = info;
  // Draw the users
  const drawnIds = new Set<string>();
  effects.forEach((effect) => {
    const hex = findHex(info.grid, {
      x: effect.longitude,
      y: effect.latitude,
    });
    if (hex) {
      if (
        effect.staticAssetPath ||
        effect.appearAnimation ||
        effect.disappearAnimation
      ) {
        const { height: h, width: w } = hex;
        let asset = group_ground.getObjectByName(effect.id) as Group;
        if (!asset) {
          // Group for the asset
          asset = new Group();
          asset.name = effect.id;
          asset.userData.type = effect.type; // e.g. "barrier"
          // Sprite to show
          if (effect.staticAssetPath) {
            const texture = new TextureLoader().load(effect.staticAssetPath);
            const material = new SpriteMaterial({ map: texture });
            const sprite = new Sprite(material);
            sprite.scale.set(w, h, 1);
            sprite.position.set(w / 2, h / 2, 0);
            asset.add(sprite);
          }
          // If there is an appear animation, show it. Mark it for hiding,
          // which we catch and use to remove it
          if (effect.appearAnimation && animationId !== 0) {
            const actionSprite = showAnimation(
              effect.appearAnimation,
              hex,
              spriteMixer
            );
            if (actionSprite) asset.add(actionSprite);
          }
          // If there is a static animation, show it.
          if (effect.staticAnimation) {
            const actionSprite = showAnimation(
              effect.staticAnimation,
              hex,
              spriteMixer,
              true
            );
            if (actionSprite) asset.add(actionSprite);
          }
          // TODO: static animation with LoopInfinite
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
          group_ground.add(asset);
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
  });
  // Hide all which are not used anymore
  group_ground.children.forEach((object) => {
    if (!drawnIds.has(object.name)) {
      object.visible = false;
    }
  });
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
export const createUserSprite = (userData: ReturnedUserState, hex: TerrainHex) => {
  // If not there, nope
  if (userData.curHealth <= 0 || userData.fledBattle) return undefined;

  // Group is used to group components of the user Marker
  const group = new Group();
  const { height: h, width: w } = hex;

  // Shadow
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (context) {
    context.globalAlpha = 0.3;
    context.fillStyle = "black";
    context.beginPath();
    context.arc(w / 2, h / 2, h / 2, 0, 2 * Math.PI);
    context.fill();
  }
  const texture = new Texture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  const shadow_material = new SpriteMaterial({ map: texture });
  const shadow_sprite = new Sprite(shadow_material);
  shadow_sprite.scale.set(w * 0.7, h * 0.4, 1);
  shadow_sprite.position.set(w / 2, h * 0.3, -6);
  group.add(shadow_sprite);

  // User marker background or raw image
  const noMarker = userData.isAi && userData.isOriginal;
  if (noMarker) {
    const map = new TextureLoader().load(userData.avatar || "");
    map.generateMipmaps = false;
    map.minFilter = LinearFilter;
    const material = new SpriteMaterial({ map: map });
    const sprite = new Sprite(material);
    sprite.scale.set(h * 0.8, h * 0.8, 1);
    sprite.position.set(w / 2, h * 0.6, -6);
    group.add(sprite);
  } else {
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
  }

  // If this is the original and our user (we have SP/CP), then show a star
  if ("curStamina" in userData && userData.isOriginal) {
    const marker = new TextureLoader().load("combat/star.webp");
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
        if (
          (user.curHealth <= 0 || user.fledBattle === true) &&
          user.hidden === undefined
        ) {
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
  battle: UserBattle;
  grid: Grid<TerrainHex>;
  currentHighlights: Set<string>;
}) => {
  // Definitions
  const { group_tiles, user, battle, currentHighlights, action, grid, timeDiff } = info;
  const intersects = info.raycaster.intersectObjects(group_tiles.children);
  const users = battle.usersState;
  const origin = user && grid.getHex({ col: user.longitude, row: user.latitude });

  // Highlight fields on the map where action can be applied
  const newHighlights = new Set<string>();
  const highlights = getPossibleActionTiles(action, origin, grid);

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

  // Check if we have enough action points to perform action
  const canAct =
    user &&
    action &&
    actionSecondsAfterAction(user, action, timeDiff) >= -COMBAT_PREMOVE_SECONDS;
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
        u.fledBattle === false
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
