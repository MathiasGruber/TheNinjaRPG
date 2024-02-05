import {
  Vector3,
  LineBasicMaterial,
  EdgesGeometry,
  Line,
  LinearFilter,
  SpriteMaterial,
  Sprite,
  Group,
  BufferGeometry,
  BufferAttribute,
  Mesh,
  type Raycaster,
} from "three";
import { loadTexture, createTexture } from "@/libs/threejs/util";
import { createNoise2D } from "simplex-noise";
import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "./constants";
import { VILLAGE_LONG, VILLAGE_LAT } from "./constants";
import { getTileInfo } from "./biome";
import { calcIsInVillage } from "./controls";
import { groupBy } from "@/utils/grouping";
import { defineHex, findHex } from "../hexgrid";
import { getActiveObjectives } from "@/libs/quest";
import { LocationTasks } from "@/validators/objectives";
import type { ComplexObjectiveFields } from "@/validators/objectives";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { UserData } from "../../../drizzle/schema";
import type { TerrainHex, PathCalculator, HexagonalFaceMesh } from "../hexgrid";
import type { SectorUser, SectorPoint, GlobalTile } from "./types";

export const drawQuest = (info: {
  group_quest: Group;
  grid: Grid<TerrainHex>;
  user: NonNullable<UserWithRelations>;
}) => {
  const { user, grid, group_quest } = info;
  const activeObjectives = getActiveObjectives(user);
  activeObjectives
    .filter((o) => LocationTasks.find((t) => t === o.task))
    .map((objective) => {
      if (!("image" in objective) || !objective.image) return null;
      const { latitude: y, longitude: x } = objective as ComplexObjectiveFields;
      const hex = findHex(grid, { x, y });
      if (!hex) return null;
      const { height: h, width: w } = hex;
      let mesh = group_quest.getObjectByName(objective.id);
      if (!mesh) {
        mesh = new Group();
        mesh.name = objective.id;
        // Marker
        const marker = loadTexture("map/userMarker.webp");
        const markerMat = new SpriteMaterial({ map: marker, alphaMap: marker });
        const markerSprite = new Sprite(markerMat);
        markerSprite.userData.type = "marker";
        if (objective.task === "move_to_location") {
          markerSprite.material.color.setHex(0xf4e365);
        } else if (objective.task === "collect_item") {
          markerSprite.material.color.setHex(0x6666a3);
        } else if (objective.task === "defeat_opponents") {
          markerSprite.material.color.setHex(0x9c273a);
        }
        Object.assign(markerSprite.scale, new Vector3(h, h * 1.2, 1));
        Object.assign(markerSprite.position, new Vector3(w / 2, h * 0.9, -6));
        mesh.add(markerSprite);
        // White background for items
        const alphaMap = loadTexture("map/userSpriteMask.webp");
        const alphaMaterial = new SpriteMaterial({ map: alphaMap, alphaMap: alphaMap });
        const alphaSprite = new Sprite(alphaMaterial);
        alphaSprite.material.color.setHex(0xd3d9ea);
        Object.assign(alphaSprite.scale, new Vector3(h * 0.8, h * 0.8, 1));
        Object.assign(alphaSprite.position, new Vector3(w / 2, h * 1.0, -6));
        mesh.add(alphaSprite);
        // Image Sprite
        const map = loadTexture(objective.image ? `${objective.image}?1=1` : "");
        map.generateMipmaps = false;
        map.minFilter = LinearFilter;
        const material = new SpriteMaterial({ map: map, alphaMap: alphaMap });
        const sprite = new Sprite(material);
        Object.assign(sprite.scale, new Vector3(h * 0.8, h * 0.8, 1));
        Object.assign(sprite.position, new Vector3(w / 2, h * 1.0, -6));
        mesh.add(sprite);
        group_quest.add(mesh);
      }
      mesh.position.set(-hex.center.x, -hex.center.y, 0);
    });
};

/**
 * Creates heaxognal grid & draw it using js. Return groups of objects drawn
 */
export const drawSector = (
  width: number,
  prng: () => number,
  hasVillage: boolean,
  globalTile: GlobalTile,
) => {
  // Calculate hex size
  const stackingDisplacement = 1.31;
  const hexsize = (width / SECTOR_WIDTH / 2) * stackingDisplacement;

  // Used for procedural map generation
  const noiseGen = createNoise2D(prng);

  // Create the grid first
  const Tile = defineHex({
    dimensions: hexsize,
    origin: { x: -hexsize, y: -hexsize },
    orientation: Orientation.FLAT,
  });
  const honeycombGrid = new Grid(
    Tile,
    rectangle({ width: SECTOR_WIDTH, height: SECTOR_HEIGHT }),
  ).map((tile) => {
    const nx = tile.col / SECTOR_WIDTH - 0.5;
    const ny = tile.row / SECTOR_HEIGHT - 0.5;
    tile.level = noiseGen(nx, ny) / 2 + 0.5;
    tile.cost = 1;
    return tile;
  });

  // Groups for organizing objects
  const group_tiles = new Group();
  const group_edges = new Group();
  const group_assets = new Group();

  // Hex points
  const points = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];

  // Line material to use for edges
  const lineMaterial = new LineBasicMaterial({ color: 0x555555 });

  // Draw the tiles
  honeycombGrid.forEach((tile) => {
    if (tile) {
      const { material, sprites, asset } = getTileInfo(prng, tile, globalTile);
      tile.asset = asset;
      if (!hasVillage || !calcIsInVillage({ x: tile.col, y: tile.row })) {
        sprites.map((sprite) => group_assets.add(sprite));
      }

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

      const edges = new EdgesGeometry(geometry);
      edges.translate(0, 0, 1);
      const edgeMesh = new Line(edges, lineMaterial);
      edgeMesh.matrixAutoUpdate = false;
      group_edges.add(edgeMesh);
    }
  });

  // Reverse the order of objects in the group_assets
  group_assets.children.sort((a, b) => b.position.y - a.position.y);

  return { group_tiles, group_edges, group_assets, honeycombGrid };
};

/**
 * User sprite, which loads the avatar image and displays the health bar as a js sprite
 */
export const createUserSprite = (userData: SectorUser, hex: TerrainHex) => {
  // Group is used to group components of the user Marker
  const group = new Group();
  const { height: h, width: w } = hex;

  // Marker
  const marker = loadTexture("map/userMarker.webp");
  const markerMat = new SpriteMaterial({ map: marker, alphaMap: marker });
  const markerSprite = new Sprite(markerMat);
  markerSprite.userData.type = "marker";
  Object.assign(markerSprite.scale, new Vector3(h, h * 1.2, 1));
  Object.assign(markerSprite.position, new Vector3(w / 2, h * 0.9, -6));
  group.add(markerSprite);

  // Avatar Sprite
  const alphaMap = loadTexture("map/userSpriteMask.webp");
  const map = loadTexture(userData.avatar ? `${userData.avatar}?1=1` : "");
  map.generateMipmaps = false;
  map.minFilter = LinearFilter;
  const material = new SpriteMaterial({ map: map, alphaMap: alphaMap });
  const sprite = new Sprite(material);
  Object.assign(sprite.scale, new Vector3(h * 0.8, h * 0.8, 1));
  Object.assign(sprite.position, new Vector3(w / 2, h * 1.0, -6));
  group.add(sprite);

  // Attack button
  if (userData.rank !== "STUDENT") {
    const attack = loadTexture("map/attack.png");
    const attackMat = new SpriteMaterial({ map: attack, depthTest: false });
    const attackSprite = new Sprite(attackMat);
    attackSprite.visible = false;
    attackSprite.userData.userId = userData.userId;
    attackSprite.userData.type = "attack";
    Object.assign(attackSprite.scale, new Vector3(h * 0.8, h * 0.8, 1));
    Object.assign(attackSprite.position, new Vector3(w * 0.9, h * 1.4, -5));
    attackSprite.name = `${userData.userId}-attack`;
    group.add(attackSprite);
  }

  // Info button
  const info = loadTexture("map/info.png");
  const infoMat = new SpriteMaterial({ map: info, depthTest: false });
  const infoSprite = new Sprite(infoMat);
  infoSprite.visible = false;
  infoSprite.userData.userId = userData.userId;
  infoSprite.userData.type = "info";
  Object.assign(infoSprite.scale, new Vector3(h * 0.7, h * 0.7, 1));
  Object.assign(infoSprite.position, new Vector3(w * 0.1, h * 1.4, -5));
  infoSprite.name = `${userData.userId}-info`;
  group.add(infoSprite);

  // Name
  group.name = userData.userId;
  group.userData.type = "user";
  group.userData.userId = userData.userId;
  group.userData.hex = hex;

  return group;
};

/**
 * User sprite, which loads the avatar image and displays the health bar as a js sprite
 */
export const createMultipleUserSprite = (
  nUsers: number,
  location: string,
  dimensions: { height: number; width: number },
) => {
  // Group is used to group components of the user Marker
  const group = new Group();
  const { height: h, width: w } = dimensions;

  // Avatar Sprite
  const canvas = document.createElement("canvas");
  const r = 3;
  canvas.width = r * h;
  canvas.height = r * h;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = `bold ${(r * h) / 2}px Serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    // NOTE: drawing a circle here there is a bug with alphaMap and userSprite sorting
    //       Therefore doing a square for now
    // const centerX = canvas.width / 2;
    // const centerY = canvas.height / 2;
    // const radius = ((r - 0.1) * h) / 2;
    // context.beginPath();
    // context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    // context.fillStyle = "darkorange";
    // context.fill();
    // context.lineWidth = 1;
    // context.strokeStyle = "#003300";
    // context.stroke();
    context.fillStyle = "firebrick";
    context.fillRect(0, 0, r * h, r * h);
    context.lineWidth = h / 2;
    context.strokeStyle = "maroon";
    context.strokeRect(0, 0, r * h, r * h);
    context.fillStyle = "white";
    context.fillText(`${nUsers}`, (r * h) / 2, (r * h) / 2);
  }
  const texture = createTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  const material = new SpriteMaterial({ map: texture });
  const sprite = new Sprite(material);
  sprite.position.set(w * 0.8, h * 1.3, -4);
  sprite.scale.set(h * 0.5, h * 0.5, 0.00000001);
  group.add(sprite);

  // Name
  group.name = location;
  group.userData.type = "users";

  return group;
};

/**
 * Draw village on map
 */
export const drawVillage = (villageName: string, grid: Grid<TerrainHex>) => {
  const hex = grid.getHex({ col: VILLAGE_LONG, row: VILLAGE_LAT });
  const group = new Group();
  if (hex) {
    const { height: h, x, y } = hex;
    // Village shadow
    const shadow_texture = loadTexture("map/shadow.png");
    const shadow_material = new SpriteMaterial({ map: shadow_texture });
    const shadow_sprite = new Sprite(shadow_material);
    shadow_sprite.scale.set(h * 2.6, h * 2, 1);
    shadow_sprite.position.set(x, y - h / 3, -7);
    group.add(shadow_sprite);
    // Village graphic
    const graphic = loadTexture(`map/${villageName}.webp`);
    const graphicMat = new SpriteMaterial({ map: graphic });
    const graphicSprite = new Sprite(graphicMat);
    graphicSprite.scale.set(h * 2.2, h * 2.2, 1);
    graphicSprite.position.set(x, y, -7);
    group.add(graphicSprite);
    // Village text
    const text = loadTexture(`villages/${villageName}Marker.png`);
    const textMat = new SpriteMaterial({ map: text });
    const textSprite = new Sprite(textMat);
    textSprite.scale.set(h * 1.5, h * 0.5, 1);
    textSprite.position.set(x, y + h, -7);
    group.add(textSprite);
  }
  return group;
};

/**
 * Draw/update the users on the map. Should be called on every render
 */
export const drawUsers = (info: {
  group_users: Group;
  users: SectorUser[];
  grid: Grid<TerrainHex>;
  showVillage: boolean;
  lastTime: number;
  angle: number;
}) => {
  // Group the users by their location
  const groups = groupBy(
    info.users.map((user) => ({
      ...user,
      group: `${user.latitude},${user.longitude}`,
    })),
    "group",
  );

  // Calculate new angle, which is used for rotating users placed on same location
  const dt = Date.now() - info.lastTime;
  const phi = info.angle + (1 * Math.PI) / (5000 / dt);

  // Draw the users
  const drawnIds = new Set<string>();
  groups.forEach((tileUsers) => {
    if (tileUsers[0]) {
      // Determine the location
      const firstUser = tileUsers[0];
      const nUsers = tileUsers.length;
      const hex = findHex(info.grid, {
        x: firstUser.longitude,
        y: firstUser.latitude,
      });
      if (hex) {
        // Loop through the users in the group
        tileUsers.forEach((user, i) => {
          let userMesh = info.group_users.getObjectByName(user.userId);
          if (!userMesh && hex) {
            userMesh = createUserSprite(user, hex);
            info.group_users.add(userMesh);
          }
          // Get location
          if (userMesh && info.grid) {
            userMesh.visible = true;
            userMesh.userData.tile = hex;
            let { x, y } = hex.center;
            const spread = 0.1;
            if (nUsers > 1) {
              const angleChange = (i / tileUsers.length) * 2 * Math.PI + phi;
              x += spread * hex.width * Math.sin(angleChange);
              y -= spread * hex.height * Math.cos(angleChange);
            }
            userMesh.position.set(-x, -y, 0);
            drawnIds.add(userMesh.name);
          }
        });
        // Add indicator of how many users are there if more than 1
        if (nUsers > 2 && tileUsers[0]) {
          const indicatorName = `${hex.col}-${hex.row}-${nUsers}`;
          let indicatorMesh = info.group_users.getObjectByName(indicatorName);
          if (!indicatorMesh) {
            indicatorMesh = createMultipleUserSprite(nUsers, "test", hex);
            indicatorMesh.name = indicatorName;
            indicatorMesh.position.set(-hex.center.x, -hex.center.y, 0);
            info.group_users.add(indicatorMesh);
          } else {
            indicatorMesh.visible = true;
          }
          drawnIds.add(indicatorName);
        }
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

  // Return new counters + angle
  return phi;
};

/**
 * Get intersections with user sprites, and show info/attack buttons if needed.
   If more than one user intersected, do not show
 */
export const intersectUsers = (info: {
  group_users: Group;
  raycaster: Raycaster;
  users: SectorUser[];
  userData: UserData;
  currentTooltips: Set<string>;
}) => {
  const { group_users, raycaster, users, userData, currentTooltips } = info;
  const intersects = raycaster.intersectObjects(group_users.children);
  const newUserTooltips = new Set<string>();
  const userMesh = intersects.find(
    (i) =>
      i.object.parent?.userData.type === "user" &&
      i.object.parent?.userData.userId !== userData.userId,
  )?.object.parent;
  if (users && userMesh && intersects.length > 0) {
    const userHex = userMesh.userData.tile as TerrainHex;
    const locationUsers = users.filter(
      (g) =>
        g.latitude === userHex.row &&
        g.longitude === userHex.col &&
        g.userId !== userData.userId,
    );
    if (locationUsers.length === 1 && userMesh) {
      const userId = userMesh.userData.userId as string;
      const attack = userMesh?.children[2] as Sprite;
      const info = userMesh?.children[3] as Sprite;
      if (attack && userData.userId !== userId) attack.visible = true;
      if (info) info.visible = true;
      if (document.body.style.cursor !== "wait") {
        document.body.style.cursor = "pointer";
      }
      newUserTooltips.add(userMesh.name);
    }
  }

  currentTooltips.forEach((userId) => {
    if (!newUserTooltips.has(userId)) {
      const attackSprite = group_users.getObjectByName(`${userId}-attack`);
      if (attackSprite) attackSprite.visible = false;
      const infoSprite = group_users.getObjectByName(`${userId}-info`);
      if (infoSprite) infoSprite.visible = false;
    }
  });

  if (currentTooltips.size === 0 && document.body.style.cursor !== "wait") {
    document.body.style.cursor = "default";
  }

  return newUserTooltips;
};

export const intersectTiles = (info: {
  group_tiles: Group;
  raycaster: Raycaster;
  pathFinder: PathCalculator;
  origin: TerrainHex;
  currentHighlights: Set<string>;
  setHoverPosition: React.Dispatch<React.SetStateAction<SectorPoint | null>>;
}) => {
  const { group_tiles, raycaster, origin, pathFinder, currentHighlights } = info;
  const intersects = raycaster.intersectObjects(group_tiles.children);
  const newHighlights = new Set<string>();
  if (intersects.length > 0 && intersects[0]) {
    const intersected = intersects[0].object as HexagonalFaceMesh;
    // Fetch the shortest path on the map using A*
    const target = intersected.userData.tile;
    const shortestPath = origin && pathFinder.getShortestPath(origin, target);
    // Update hover position
    info.setHoverPosition({ x: target.col, y: target.row });
    // Highlight the path
    void shortestPath?.forEach((tile) => {
      const mesh = group_tiles.getObjectByName(
        `${tile.row},${tile.col}`,
      ) as HexagonalFaceMesh;
      if (mesh.userData.highlight === false) {
        mesh.userData.highlight = true;
        mesh.material.color.offsetHSL(0, 0, 0.1);
      }
      newHighlights.add(mesh.name);
    });
  }
  // Remove highlights from tiles that are no longer in the path
  currentHighlights.forEach((name) => {
    if (!newHighlights.has(name)) {
      const mesh = group_tiles.getObjectByName(name) as HexagonalFaceMesh;
      mesh.userData.highlight = false;
      mesh.material.color.setHex(mesh.userData.hex);
    }
  });
  return newHighlights;
};
