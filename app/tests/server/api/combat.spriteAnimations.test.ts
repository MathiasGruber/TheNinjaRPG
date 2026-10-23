import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import * as nextServer from "next/server";
import { Sprite, Texture } from "three";
import {
  actionLog,
  aiProfile,
  aiSpriteAnimation,
  battle,
  battleAction,
  jutsu,
  spriteAnimation,
  userData,
  userJutsu,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { updateCharacterAnimation } from "@/libs/threejs/characterAnimation";
import { combatRouter, initiateBattle } from "@/server/api/routers/combat";
import { spriteAnimationRouter } from "@/server/api/routers/spriteAnimation";
import { ActionEndTurn, ActionUseSpecificJutsu } from "@/validators/ai";
import { makeTag } from "../../libs/combat/helpers/battleScenario";
import { insertUsers } from "../../setup/factories";
import {
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

describeWithDatabase("combat sprite animation delivery", () => {
  beforeEach(async () => {
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    vi.spyOn(nextServer, "after").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      Response.json(
        String(url).endsWith("/pipeline")
          ? [{ result: [59, 60] }]
          : { result: [59, 60] },
      ),
    );
    await resetTables(
      aiSpriteAnimation, spriteAnimation, battleAction, battle, actionLog,
      userJutsu, jutsu, aiProfile, userData,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["ARENA", "QUEST"] as const)(
    "delivers an assigned jutsu before the following wait in manual %s combat",
    async (battleType) => {
      const { api, saved, npc, player, perform, logs } = await startBattle({ battleType });
      const sprite = new Sprite();
      const rendering = {
        sprite, animations: npc.spriteAnimations, moving: false,
        facing: "left" as const, staticMap: loadedTexture(), textureForPath: loadedTexture,
      };
      updateCharacterAnimation({ ...rendering, event: undefined, now: 0 });

      const attack = await perform();
      const event = attack.usersState.find((user) => user.userId === npc.userId)!.spriteAnimationEvent;
      expect(event?.actionKey).toBe("jutsu:strike");
      expect(attack.activeUserId).toBe(npc.userId);
      expect(attack.usersState.find((user) => user.userId === player.userId)!.curHealth)
        .toBeLessThan(player.curHealth);
      expect((await logs()).map((row) => row.actionId)).toEqual(["strike"]);
      updateCharacterAnimation({ ...rendering, event, now: 100 });
      expect(sprite.userData.characterAnimation.animationId).toBe("attack");

      const polled = await api.getBattle({ battleId: saved.id });
      const polledEvent = polled.battle!.usersState.find((user) => user.userId === npc.userId)!.spriteAnimationEvent;
      expect(polledEvent).toEqual(event);
      expect(polled.battle!.version).toBe(attack.version);
      expect(await logs()).toHaveLength(1);
      updateCharacterAnimation({ ...rendering, event: polledEvent, now: 400 });
      expect(sprite.userData.characterAnimation.startedAt).toBe(100);
      updateCharacterAnimation({ ...rendering, event: polledEvent, now: 1200 });
      expect(sprite.userData.characterAnimation.animationId).toBe("idle");
      updateCharacterAnimation({ ...rendering, event: polledEvent, now: 1300 });
      expect(sprite.userData.characterAnimation.animationId).toBe("idle");
      const remounted = new Sprite();
      updateCharacterAnimation({ ...rendering, sprite: remounted, event: polledEvent, now: 1300 });
      expect(remounted.userData.characterAnimation.animationId).toBe("idle");

      const wait = await perform();
      const waitEvent = wait.usersState.find((user) => user.userId === npc.userId)!.spriteAnimationEvent;
      expect(waitEvent?.actionKey).toBe("basic:wait");
      expect(waitEvent?.id).not.toBe(event?.id);
      expect(wait.activeUserId).toBe(player.userId);
      expect((await logs()).map((row) => row.actionId)).toEqual(["strike", "wait"]);
      updateCharacterAnimation({ ...rendering, event: waitEvent, now: 1400 });
      expect(sprite.userData.characterAnimation.animationId).toBe("wait");
    },
  );

  it("delivers a human end-turn before advancing the animated AI", async () => {
    const { npc, player, perform, logs } = await startBattle({ firstActor: "player" });
    const handoff = await perform({ actionId: "wait", longitude: player.longitude, latitude: player.latitude });
    expect(handoff.activeUserId).toBe(npc.userId);
    expect(handoff.usersState.find((user) => user.userId === npc.userId)!.spriteAnimationEvent).toBeUndefined();
    expect((await logs()).map((row) => row.actionId)).toEqual(["wait"]);
    const attack = await perform();
    expect(attack.usersState.find((user) => user.userId === npc.userId)!.spriteAnimationEvent?.actionKey).toBe("jutsu:strike");
    expect((await logs()).map((row) => row.actionId)).toEqual(["wait", "strike"]);
  });

  it.each(["none", "dead", "fled", "left"] as const)(
    "keeps batching unanimated AI actions (animated participant: %s)",
    async (inactive) => {
      const { db, saved, npc, player, perform, logs } = await startBattle({ animated: false });
      if (inactive !== "none") {
        saved.usersState.push({
          ...structuredClone(npc), userId: "departed-ai", controllerId: "departed-ai",
          curHealth: inactive === "dead" ? 0 : npc.curHealth,
          fledBattle: inactive === "fled", leftBattle: inactive === "left",
          spriteAnimations: { idle: {
            id: "idle", name: "Idle", url: "https://example.com/idle.png",
            columns: 6, rows: 2, frameCount: 12, fps: 12, facing: "left",
          } },
        });
        await db.update(battle).set({ usersState: saved.usersState }).where(eq(battle.id, saved.id));
      }
      const response = await perform();
      expect(response.activeUserId).toBe(player.userId);
      expect((await logs()).map((row) => row.actionId)).toEqual(["strike", "wait"]);
      expect(response.usersState.find((user) => user.userId === npc.userId)!.spriteAnimationEvent).toBeUndefined();
    },
  );
});

const startBattle = async ({
  battleType = "ARENA", animated = true, firstActor = "ai",
}: {
  battleType?: "ARENA" | "QUEST";
  animated?: boolean;
  firstActor?: "ai" | "player";
} = {}) => {
  const db = await getTestDatabase();
  await insertUsers([
    { userId: "editor", username: "Editor", role: "CONTENT", rank: "JONIN", level: 50 },
    { userId: "player", username: "Player", rank: "JONIN", level: 50 },
    { userId: "ai", username: "AI", isAi: true, rank: "JONIN", level: 50 },
  ]);
  await db.insert(aiProfile).values({
    id: "Default", userId: "ai", includeDefaultRules: false, rules: [
      { conditions: [], action: ActionUseSpecificJutsu.parse({ jutsuId: "strike", target: "CLOSEST_OPPONENT" }) },
      { conditions: [], action: ActionEndTurn.parse({}) },
    ],
  });
  await db.insert(jutsu).values({
    id: "strike", name: "Strike", description: "Strike", battleDescription: "%user strikes %target",
    image: "/jutsu.png", effects: [makeTag("damage", {
      power: 1, powerPerLevel: 0, calculation: "static", statTypes: [], generalTypes: [], elements: [], rounds: 0,
    })], target: "OTHER_USER", range: 10, requiredRank: "STUDENT", jutsuType: "NORMAL",
    cooldown: 1, actionCostPerc: 40,
  });
  await db.insert(userJutsu).values({ id: "owned-strike", userId: "ai", jutsuId: "strike", equipped: true });
  if (animated) {
    await db.insert(spriteAnimation).values(["idle", "attack", "wait"].map((id) => ({
      id, name: id, url: `https://example.com/${id}.png`, columns: 6, rows: 2,
      frameCount: 12, fps: 12, facing: "left" as const, createdByUserId: "editor",
    })));
    const editor = callerForDatabase(spriteAnimationRouter, "editor", db);
    for (const [actionKey, animationId] of [["idle", "idle"], ["jutsu:strike", "attack"], ["basic:wait", "wait"]] as const) {
      expect((await editor.assign({ userId: "ai", actionKey, animationId })).success).toBe(true);
    }
  }
  expect((await initiateBattle({ client: db, userIds: ["player"], targetIds: ["ai"] }, battleType)).success).toBe(true);
  const saved = (await db.query.battle.findFirst())!;
  const npc = saved.usersState.find((user) => user.controllerId === "ai")!;
  const player = saved.usersState.find((user) => user.userId === "player")!;
  npc.longitude = 1; npc.latitude = 1;
  player.longitude = 2; player.latitude = 1;
  player.initiative = firstActor === "player" ? 100 : 0;
  npc.initiative = firstActor === "ai" ? 100 : 0;
  saved.activeUserId = firstActor === "ai" ? npc.userId : player.userId;
  await db.update(battle).set({
    usersState: saved.usersState, activeUserId: saved.activeUserId, roundStartAt: new Date(),
  }).where(eq(battle.id, saved.id));
  const api = callerForDatabase(combatRouter, "player", db);
  let version = saved.version;
  const perform = async (action: { actionId?: string; longitude?: number; latitude?: number } = {}) => {
    const result = await api.performAction({ battleId: saved.id, version, ...action });
    expect(result.updateClient).toBe(true);
    if (!("battleUpdate" in result) || !result.battleUpdate) throw new Error("Missing battle update");
    version = result.battleUpdate.version;
    return result.battleUpdate;
  };
  const logs = () => db.query.battleAction.findMany({
    where: eq(battleAction.battleId, saved.id), orderBy: (row, { asc }) => asc(row.battleVersion),
  });
  return { db, api, saved, npc, player, perform, logs };
};

const loadedTexture = () => {
  const texture = new Texture();
  texture.image = { width: 3072, height: 1024 };
  return texture;
};
