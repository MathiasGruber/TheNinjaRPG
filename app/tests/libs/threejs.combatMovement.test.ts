import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { Grid, rectangle } from "honeycomb-grid";
import { Group, Sprite, Texture, TextureLoader } from "three";
import type { UserData } from "@/drizzle/schema";
import type { ReturnedBattle, ReturnedUserState } from "@/libs/combat/types";
import { defineHex } from "@/libs/hexgrid";
import type { CharacterAnimations } from "@/libs/spriteAnimations";
import { createAggroHalo } from "@/libs/threejs/aggroHalo";
import { AI_AVATAR_SPRITE, drawCombatUsers, resetCombatCaches } from "@/libs/threejs/combat";

let now = 0;
let sequence = 0;
const sprites = new Set<Sprite>();
beforeEach(() => {
  now = 0;
  resetCombatCaches();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const atlas = new Texture<HTMLImageElement>();
  atlas.image = document.createElement("img");
  atlas.image.width = 3072;
  atlas.image.height = 2048;
  vi.spyOn(TextureLoader.prototype, "load").mockReturnValue(atlas);
});
afterEach(() => {
  for (const sprite of sprites) sprite.userData.disposeCharacterAnimation?.();
  sprites.clear();
  vi.restoreAllMocks();
  resetCombatCaches();
});

const fixture = (animated = true) => {
  const id = `walking-${sequence++}`;
  const animations: CharacterAnimations = Object.fromEntries(["idle", "move"].map((action) => [action, {
    id: action, name: action, url: `https://example.com/${id}-${action}.png`,
    columns: 6, rows: action === "move" ? 2 : 4,
    frameCount: action === "move" ? 12 : 24, fps: 12.5, facing: "left",
  }]));
  const user = {
    userId: id, username: "Walker", isAi: true, isOriginal: true, avatarFacing: "left",
    direction: "left", longitude: 0, latitude: 0, curHealth: 100, maxHealth: 100,
    fledBattle: false, leftBattle: false, spriteAnimations: animated ? animations : {},
  } as ReturnedUserState;
  const grid = new Grid(defineHex(), rectangle({ width: 3, height: 1 }));
  grid.forEach((hex) => { hex.cost = 1; hex.blocked = false; });
  const actor = new Group();
  actor.name = id;
  const sprite = new Sprite();
  sprites.add(sprite);
  sprite.name = AI_AVATAR_SPRITE;
  sprite.userData = { avatarFacing: "left", avatarPath: `https://example.com/${id}.png`, mirrored: false };
  actor.add(sprite, createAggroHalo(20, 20, false));
  const group = new Group();
  group.add(actor);
  const battle = { usersState: [user], usersEffects: [] } as unknown as ReturnedBattle;
  const draw = (ms: number, users = [user]) => {
    now = ms;
    return drawCombatUsers({ group_users: group, users, usersEffects: [], grid,
      playerId: "viewer", userData: { userId: "viewer" } as UserData, battle, sfxEnabled: false });
  };
  draw(0);
  const start = actor.position.clone();
  user.longitude = 1;
  draw(0);
  const target = grid.getHex({ col: 1, row: 0 })!;
  return { actor, sprite, user, grid, draw, start, target };
};

describe("combat walking playback", () => {
  it.each([30, 60, 170])("plays the walk throughout one tile at %i FPS, then returns to idle", (fps) => {
    const { actor, sprite, draw, start, target } = fixture();
    const frames = new Set<string>();
    for (let time = 1000 / fps; time < 480; time += 1000 / fps) {
      expect(draw(time)).toBe(true);
      frames.add(`${sprite.material.map?.offset.x},${sprite.material.map?.offset.y}`);
    }
    draw(480);
    expect(actor.position.x).toBeCloseTo((start.x - target.center.x) / 2, 5);
    expect(actor.position.y).toBeCloseTo((start.y - target.center.y) / 2, 5);
    expect(sprite.userData.characterAnimation.animationId).toBe("move");
    expect(frames.size).toBeGreaterThanOrEqual(5);
    for (let time = 480 + 1000 / fps; time < 1000; time += 1000 / fps) draw(time);
    expect(draw(1000)).toBe(false);
    expect(actor.position.x).toBe(-target.center.x);
    expect(actor.position.y).toBe(-target.center.y);
    expect(sprite.userData.characterAnimation.animationId).toBe("idle");
  });

  it("keeps the segment clock when no path is available", () => {
    const { actor, draw, user, grid } = fixture();
    grid.getHex({ col: 2, row: 0 })!.blocked = true;
    user.longitude = 2;
    draw(0);
    for (let time = 50; time <= 1000; time += 50) draw(time);
    const target = grid.getHex({ col: 2, row: 0 })!;
    expect(actor.position.x).toBe(-target.center.x);
    expect(actor.position.y).toBe(-target.center.y);
  });

  it("keeps ordinary image markers on a short time-based transition", () => {
    const { actor, draw, target } = fixture(false);
    for (let time = 25; time <= 250; time += 25) draw(time);
    expect(actor.position.x).toBe(-target.center.x);
    expect(actor.position.y).toBe(-target.center.y);
  });
  it("releases a removed actor's atlases and can initialize it again", () => {
    const { actor, sprite, draw } = fixture();
    expect(sprite.userData.characterAnimation.sources.size).toBeGreaterThan(0);
    draw(100, []);
    expect(actor.visible).toBe(false);
    expect(sprite.userData.characterAnimation).toBeUndefined();
    draw(200);
    expect(actor.visible).toBe(true);
    expect(sprite.userData.characterAnimation.sources.size).toBeGreaterThan(0);
  });
});
