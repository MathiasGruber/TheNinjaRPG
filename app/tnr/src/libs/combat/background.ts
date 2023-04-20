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

import { getMapSprites } from "../travel/biome";
import { defineHex } from "../travel/sector";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "./constants";
import { group } from "console";

/**
 * Creates heaxognal grid & draw it using js. Return groups of objects drawn
 */
export const drawCombatBackground = (
  width: number,
  height: number,
  scene: Scene,
  background: string,
  prng: () => number
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
  const group_assets = new Group();

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
    opacity: 0,
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
      mesh.matrixAutoUpdate = false;
      group_tiles.add(mesh);

      // Draw the edges
      const edges = new EdgesGeometry(geometry);
      edges.translate(0, 0, 1);
      const edgeMesh = new Line(edges, lineMaterial);
      edgeMesh.matrixAutoUpdate = false;
      group_edges.add(edgeMesh);

      // Draw any objects on the tiles based on randomness
      const sprites = getMapSprites(prng, 1, "combat", tile, 0);
      sprites.map((sprite) => group_assets.add(sprite));
    }
  });

  // Reverse the order of objects in the group_assets
  group_assets.children.sort((a, b) => b.position.y - a.position.y);

  return { group_tiles, group_edges, group_assets, honeycombGrid };
};
