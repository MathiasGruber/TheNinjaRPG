import { Grid, rectangle } from "honeycomb-grid";
import {
  Color,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ASSETS_LAYER, EFFECTS_LAYER, TILES_LAYER } from "@/drizzle/constants";
import { defineHex } from "@/libs/hexgrid";
import { type CombatHoverData, highlightTiles, highlightTileTooltips } from "@/libs/threejs/combat";

// Bun has no DOM; the renderer only needs the body cursor in these tests.
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { body: { style: { cursor: "default" } } },
  });
});
afterEach(() => {
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }
});

type HighlightInfo = Parameters<typeof highlightTiles>[0];

const createScene = (offsetLayer = 0) => {
  const grid = new Grid(defineHex(), rectangle({ width: 3, height: 3 }));
  const group_tiles = new Group();
  const meshes = Array.from(grid, (tile) => {
    const mesh = new Mesh(
      new PlaneGeometry(1, 1).translate(0, 0, TILES_LAYER + offsetLayer),
      new MeshBasicMaterial({ color: "white" }),
    );
    mesh.name = `${tile.row},${tile.col}`;
    mesh.userData = {
      tile,
      originalColor: mesh.material.color.clone(),
      highlight: false,
      selected: false,
      canClick: false,
    };
    group_tiles.add(mesh);
    return mesh;
  });
  const user = {
    userId: "user-1",
    longitude: 0,
    latitude: 0,
    curHealth: 100,
    maxHealth: 100,
    actionPoints: 100,
    fledBattle: false,
  } as HighlightInfo["user"];
  const action: NonNullable<HighlightInfo["action"]> = {
    id: "wide-range",
    name: "Wide range",
    image: "",
    battleDescription: "",
    type: "basic",
    target: "GROUND",
    method: "SINGLE",
    range: 10,
    healthCost: 0,
    chakraCost: 0,
    staminaCost: 0,
    actionCostPerc: 10,
    updatedAt: 0,
    cooldown: 0,
    originalCooldown: 0,
    effects: [],
  };
  const info: HighlightInfo = {
    group_tiles,
    group_highlight_edges: new Group(),
    grid,
    user,
    battle: {
      version: 1,
      activeUserId: user.userId,
      round: 1,
      roundStartAt: new Date(),
      usersState: [user],
      usersEffects: [],
      groundEffects: [],
    } as unknown as HighlightInfo["battle"],
    action,
    precomputedActions: [action],
    timeDiff: 0,
    cachedIntersections: { battleTiles: [], tiles: [], ground: [] },
    currentHighlights: new Set<string>(),
  };
  const render = () => {
    info.currentHighlights = highlightTiles(info);
    return info.currentHighlights;
  };
  return { info, meshes, render };
};

const rangeColor = new Color("white").lerp(new Color("rgb(80, 80, 80)"), 0.7);

const expectRangeColors = (meshes: Mesh<PlaneGeometry, MeshBasicMaterial>[]) => {
  for (const mesh of meshes) {
    expect(mesh.userData.highlight).toBe(true);
    expect(mesh.material.color.equals(rangeColor)).toBe(true);
  }
};

describe("highlightTileTooltips user detection", () => {
  it.each([true, false])("reports a user without effects only when present (%p)", (hasUser) => {
    const { info, meshes } = createScene();
    const hovers: (CombatHoverData | null)[] = [];
    highlightTileTooltips({
      group_tiles: info.group_tiles,
      group_users: new Group(),
      cachedIntersections: {
        battleTiles: [{ object: meshes[0]!, distance: 0, point: new Vector3() }],
        tiles: [],
        ground: [],
      },
      battleMaps: {
        usersByTile: new Map(hasUser ? [["0,0", "user-1"]] : []),
        userEffectsByUserId: new Map(),
        groundEffectsByTile: new Map(),
      },
      mouseX: 12,
      mouseY: 34,
      onHoverChange: (hover) => hovers.push(hover),
    });
    expect(hovers).toEqual([hasUser ? {
      tileKey: "0,0", userId: "user-1", position: { x: 12, y: 34 },
    } : null]);
  });

  it.each([true, false])("prefers a visible halo owner over the adjacent tile (%p)", (visible) => {
    const { info, meshes } = createScene();
    const group_users = new Group();
    const owner = new Group();
    owner.name = "halo-owner";
    owner.userData.hex = { col: 1, row: 1 };
    owner.visible = visible;
    const halo = new Group();
    const arc = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    halo.add(arc);
    owner.add(halo);
    group_users.add(owner);
    const hovers: (CombatHoverData | null)[] = [];
    highlightTileTooltips({
      group_tiles: info.group_tiles,
      group_users,
      cachedIntersections: {
        users: [{ object: arc, distance: 0, point: new Vector3() }],
        battleTiles: [{ object: meshes[0]!, distance: 1, point: new Vector3() }],
        tiles: [],
        ground: [],
      },
      battleMaps: {
        usersByTile: new Map([["0,0", "neighbor"]]),
        userEffectsByUserId: new Map(),
        groundEffectsByTile: new Map(),
      },
      mouseX: 12,
      mouseY: 34,
      onHoverChange: (value) => { hovers.push(value); },
    });
    expect(hovers).toEqual([{
      tileKey: visible ? "1,1" : "0,0",
      userId: visible ? "halo-owner" : "neighbor",
      position: { x: 12, y: 34 },
    }]);
  });
});

describe("highlightTiles range colors", () => {
  it.each([0, -0.5])(
    "keeps range and selected edges above static effects with terrain offset %p",
    (offsetLayer) => {
      const { info, meshes, render } = createScene(offsetLayer);
      info.cachedIntersections.battleTiles = [
        { object: meshes[0]!, distance: 0, point: new Vector3() },
      ];
      render();

      const edges = info.group_highlight_edges.children.filter(
        (edge): edge is LineSegments => edge instanceof LineSegments && edge.visible,
      );
      expect(edges).toHaveLength(meshes.length + 1);
      for (const edge of edges) {
        const positions = edge.geometry.getAttribute("position");
        for (let index = 0; index < positions.count; index++) {
          const layer = positions.getZ(index) + edge.position.z;
          expect(layer).toBeGreaterThan(EFFECTS_LAYER);
          expect(layer).toBeLessThan(ASSETS_LAYER);
        }
      }
      const rangeEdge = edges[0]!;
      const selectedEdge = edges.at(-1)!;
      expect(selectedEdge.position.z).toBeGreaterThan(rangeEdge.position.z);
    },
  );

  it("colors newly highlighted tiles before caching the first frame", () => {
    const { meshes, render } = createScene();
    const highlights = render();
    expectRangeColors(meshes);

    // The next frame reuses the completed colors and highlight set.
    expect(render()).toBe(highlights);
    expectRangeColors(meshes);
  });

  it("colors newly added tiles immediately when switching to a wider action", () => {
    const { info, meshes, render } = createScene();
    const wideAction = info.action;
    info.action = {
      ...wideAction,
      id: "origin-only",
      method: "SINGLE",
      range: 0,
    } as HighlightInfo["action"];
    expect(render().size).toBe(1);

    info.action = wideAction;
    expect(render().size).toBe(meshes.length);
    expectRangeColors(meshes);
  });

  it("preserves selected colors above range tint on the first frame", () => {
    const { info, meshes, render } = createScene();
    const selected = meshes[0]!;
    info.cachedIntersections.battleTiles = [
      { object: selected, distance: 0, point: new Vector3() },
    ];
    render();
    const selectedColor = new Color("white").lerp(new Color("rgb(0, 255, 100)"), 0.8);
    expect(selected.material.color.equals(selectedColor)).toBe(true);
    expect(selected.userData.canClick).toBe(true);
    expectRangeColors(meshes.slice(1));

    info.cachedIntersections.battleTiles = [];
    render();
    expectRangeColors(meshes);
    expect(selected.userData.selected).toBe(false);
    expect(selected.userData.canClick).toBe(false);
  });

  it("restores original colors and hides edges when the action is deselected", () => {
    const { info, meshes, render } = createScene();
    render();
    info.action = undefined;
    expect(render().size).toBe(0);
    for (const mesh of meshes) {
      expect(mesh.userData.highlight).toBe(false);
      expect(mesh.material.color.equals(mesh.userData.originalColor)).toBe(true);
    }
    expect(info.group_highlight_edges.children.every((edge) => !edge.visible)).toBe(true);
  });
});
