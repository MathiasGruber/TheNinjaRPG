import {
  LineBasicMaterial,
  EdgesGeometry,
  Line,
  TextureLoader,
  type Scene,
  Group,
  BufferGeometry,
  BufferAttribute,
  MeshBasicMaterial,
  Mesh,
} from "three";
import { type Battle } from "@prisma/client";
import { Orientation } from "honeycomb-grid";
import { Grid, rectangle } from "honeycomb-grid";

import { defineHex } from "../travel/sector";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "./constants";

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
  scene.background = new TextureLoader().load(`/locations/${background}`);
  console.log("WIDTH: ", width, "HEIGHT: ", height);

  // Padding for the tiles [in % of width/height]
  const leftPadding = 0.025 * width;
  const bottomPadding = 0.05 * height;

  // Calculate hex size
  const stackingDisplacement = 1.31;
  const hexsize = (width / COMBAT_WIDTH / 2.1) * stackingDisplacement;

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

  // Groups for organizing objects
  const group_tiles = new Group();
  const group_edges = new Group();
  const group_assets = new Group();

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
