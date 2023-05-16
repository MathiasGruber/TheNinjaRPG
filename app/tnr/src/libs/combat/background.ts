import {
  LineBasicMaterial,
  EdgesGeometry,
  Line,
  TextureLoader,
  type Scene,
  Group,
  BufferGeometry,
  BufferAttribute,
  SpriteMaterial,
  Sprite,
  MeshBasicMaterial,
  Mesh,
} from "three";
import { Orientation } from "honeycomb-grid";
import { Grid, rectangle } from "honeycomb-grid";

import type { TerrainHex } from "../travel/types";
import type { GroundEffect } from "./types";
import { findHex } from "../travel/sector";
import { defineHex } from "../travel/sector";
import { Animations } from "./types";
import { drawStatusBar } from "./movement";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "./constants";
import type { SpriteMixer } from "../travel/SpriteMixer";

export const showAnimation = (
  appearAnimation: string,
  hex: TerrainHex,
  spriteMixer: ReturnType<typeof SpriteMixer>
) => {
  const info = Animations.get(appearAnimation);
  if (info) {
    const { height: h, width: w } = hex;
    const texture = new TextureLoader().load(`/animations/${appearAnimation}.png`);
    const actionSprite = spriteMixer.ActionSprite(texture, 1, info.frames);
    const action = spriteMixer.Action(actionSprite, 0, info.frames, info.speed);
    if (action) {
      action.hideWhenFinished = true;
      action.playOnce();
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
  spriteMixer: ReturnType<typeof SpriteMixer>;
}) => {
  // Destructure
  const { spriteMixer } = info;
  // Draw the users
  const drawnIds = new Set<string>();
  info.effects.forEach((effect) => {
    const hex = findHex(info.grid, {
      x: effect.longitude,
      y: effect.latitude,
    });
    if (hex && (effect.staticAssetPath || effect.appearAnimation)) {
      const { height: h, width: w } = hex;
      let asset = info.group_ground.getObjectByName(effect.id) as Group;
      if (!asset && hex) {
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
        if (effect.appearAnimation) {
          const actionSprite = showAnimation(effect.appearAnimation, hex, spriteMixer);
          if (actionSprite) asset.add(actionSprite);
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
        info.group_ground.add(asset);
      }
      // Get location
      if (asset) {
        // Set visibility
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
  });
  // Hide all which are not used anymore
  info.group_ground.children.forEach((object) => {
    if (!drawnIds.has(object.name)) {
      object.visible = false;
    }
  });
};
