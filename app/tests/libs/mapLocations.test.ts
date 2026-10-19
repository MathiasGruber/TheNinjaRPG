import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { Group, Texture } from "three";
import { getQuestMapLocations, groupMapLocations, publicQuestLocations } from "@/libs/mapLocations";
import { getNewTrackers, getPublicQuestUser, verifyQuestContentForSave } from "@/libs/quest";
import { syncMapLocationSprites } from "@/libs/threejs/mapLocations";
import { drawQuest } from "@/libs/threejs/sector";
import type { UserWithRelations } from "@/routers/profile";
import { updateUserCache } from "@/utils/userCache";
import { DialogObjective, MoveToObjective, QuestValidator } from "@/validators/objectives";

const move = MoveToObjective.parse({
  id: "arrival", task: "move_to_location", sector: 724, longitude: 4, latitude: 5,
  structureAssetId: "tower", locationName: "Old watchtower", locationDescription: "A ruined tower overlooks the valley.",
  nextObjectiveId: "dialog", description: "Secret quest instructions", reward_money: 900,
});
const dialog = DialogObjective.parse({ id: "dialog", task: "dialog", nextObjectiveId: [{ text: "Continue", nextObjectiveId: "end" }] });
const quest = {
  id: "q1", hidden: false, startsAt: null, endsAt: null, consecutiveObjectives: true,
  content: { objectives: [move, dialog] },
};
const user = (goals: unknown[], overrides = {}) => ({
  sector: 724, userQuests: [{ questId: "q1", quest, completed: 0, endAt: null }],
  questData: [{ id: "q1", goals }], ...overrides,
}) as unknown as NonNullable<UserWithRelations>;
const arrival = { id: "arrival", sector: 724, longitude: 4, latitude: 5, done: false };

describe("public quest landmarks", () => {
  it("returns only neutral presentation, with no descriptions, rewards, or branches from the quest", () => {
    const locations = publicQuestLocations([quest]);
    expect(locations).toHaveLength(1);
    expect(locations[0]).toEqual({ id: "quest:q1:arrival", questId: "q1", objectiveId: "arrival", sector: 724, longitude: 4, latitude: 5, name: "Old watchtower", description: move.locationDescription, assetId: "tower", scale: 1 });
    expect(JSON.stringify(locations)).not.toContain("Secret");
    expect(JSON.stringify(locations)).not.toContain("reward");
    expect(JSON.stringify(locations)).not.toContain("nextObjectiveId");
  });
  it("excludes hidden, future, expired, randomized and masked locations", () => {
    for (const override of [{ hidden: true }, { startsAt: "2999-01-01" }, { endsAt: "2000-01-01" }]) {
      expect(publicQuestLocations([{ ...quest, ...override }])).toEqual([]);
    }
    for (const override of [{ sectorType: "random" }, { locationType: "random" }, { hideLocation: true }, { overworldPlacementId: "npc" }]) {
      expect(publicQuestLocations([{ ...quest, content: { objectives: [{ ...move, ...override } as typeof move] } }])).toEqual([]);
    }
  });
  it("keeps real sector 1337 and tile zero valid", () => {
    expect(publicQuestLocations([{ ...quest, content: { objectives: [{ ...move, sector: 1337, latitude: 0, longitude: 0 }] } }])[0]).toMatchObject({ sector: 1337, longitude: 0, latitude: 0 });
  });
});

describe("personal structure lifecycle", () => {
  it("does not show private structures to visitors", () => {
    expect(getQuestMapLocations(user([], { userQuests: [] }), [])).toEqual([]);
  });
  it("merges personal actions into the existing public landmark", () => {
    const result = getQuestMapLocations(user([arrival]), publicQuestLocations([quest]));
    expect(result).toHaveLength(1);
    expect(result[0]?.active).toBe(true);
  });
  it("follows the resolved private tracker, without changing source state", () => {
    const actor = user([{ ...arrival, longitude: 8 }]);
    const original = structuredClone(actor);
    expect(getQuestMapLocations(actor, [])[0]?.longitude).toBe(8);
    expect(actor).toEqual(original);
  });
  it("keeps an explicitly located starting dialog through tracker initialization, rendering and movement", async () => {
    const definition = QuestValidator.parse({
      name: "Tower quest", description: "Visit the tower", successDescription: "Done", questType: "mission",
      hidden: false, publicLocations: false, consecutiveObjectives: true, startsAt: null, endsAt: null, tierLevel: null,
      content: {
        objectives: [DialogObjective.parse({ ...move, id: "STARTING", task: "dialog", nextObjectiveId: dialog.nextObjectiveId }), { id: "end", task: "win_quest" }],
        reward: {}, sceneCharacters: ["guide"],
      },
    });
    expect(verifyQuestContentForSave(definition.content.objectives, true).check).toBe(true);
    const actor = user([], {
      userId: "u1", status: "AWAKE", level: 50, rank: "JONIN", role: "USER",
      villageId: "v1", isOutlaw: false, bloodlineId: null, longitude: 0, latitude: 0,
      village: { id: "v1", sector: 724 }, activeWars: [], completedQuests: [],
      userQuests: [{ id: "uq-q1", questId: "q1", completed: 0, endAt: null, previousAttempts: 0, previousCompletes: 0, quest: { ...definition, id: "q1" } }],
      questData: [],
    });
    actor.questData = getNewTrackers(actor, [{ task: "any" }]).trackers;
    expect(actor.questData[0]?.goals[0]).not.toHaveProperty("sector");
    expect(await renderThenMove(getPublicQuestUser(actor))).toMatchObject([
      { assetId: "tower", objectiveId: "STARTING", sector: 724, longitude: 4, latitude: 5, active: true },
    ]);
  });
  it("keeps resolved random tracker coordinates authoritative, including tile zero", async () => {
    const actor = structuredClone(user([{ ...arrival, sector: 725, longitude: 0, latitude: 0 }]));
    Object.assign(actor.userQuests[0]!.quest.content.objectives[0]!, { sectorType: "random", locationType: "random" });
    expect((await renderThenMove(actor))[0]).toMatchObject({ sector: 725, longitude: 0, latitude: 0 });
  });
  it("keeps concealed targets hidden outside their sector after public projection", async () => {
    for (const sector of [724, 725]) {
      const actor = structuredClone(user([arrival], { sector, role: "USER" }));
      Object.assign(actor.userQuests[0]!.quest.content.objectives[0]!, { hideLocation: true });
      const projected = getPublicQuestUser(actor);
      expect(await renderThenMove(projected)).toHaveLength(sector === 724 ? 1 : 0);
      if (sector === 725) expect(projected.questData![0]!.goals[0]).not.toHaveProperty("sector");
    }
  });
  it("retains the building when arrival advances to a dialog at the same location", async () => {
    const result = await renderThenMove(user([
      { ...arrival, done: true, selectedNextObjectiveId: "dialog" },
      { ...arrival, id: "dialog" },
    ]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ assetId: "tower", objectiveId: "dialog", active: true });
  });
  it("removes private scenery on departure to another objective location", () => {
    expect(getQuestMapLocations(user([
      { ...arrival, done: true, selectedNextObjectiveId: "dialog" },
      { ...arrival, id: "dialog", longitude: 9 },
    ]), [])).toEqual([]);
  });
  it("keeps public scenery neutral after completion or abandonment", () => {
    const publicLocations = publicQuestLocations([quest]);
    expect(getQuestMapLocations(user([], { userQuests: [] }), publicLocations)).toEqual(publicLocations);
  });
  it("does not draw masked coordinates or unavailable branches", () => {
    expect(getQuestMapLocations(user([{ ...arrival, latitude: 1337, longitude: 1337, sector: 1337 }]), [])).toEqual([]);
    expect(getQuestMapLocations(user([{ ...arrival, id: "dialog" }]), [])).toEqual([]);
  });
  it("groups co-located landmarks deterministically while retaining all quest actions", () => {
    const location = publicQuestLocations([quest])[0]!;
    const groups = groupMapLocations([location, { ...location, id: "q2", active: true }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((l) => l.id)).toEqual(["q2", location.id]);
  });
  it("uses the live fixed NPC location and retains its interaction binding", () => {
    const actor = structuredClone(user([arrival]));
    actor.userQuests[0]!.quest.content.objectives[0] = { ...move, overworldPlacementId: "npc" };
    expect(getQuestMapLocations(actor, [])).toEqual([]);
    expect(getQuestMapLocations(actor, [], [{ npcPlacementId: "npc", sector: 724, longitude: 8, latitude: 9 }])[0]).toMatchObject({
      npcPlacementId: "npc", longitude: 8, latitude: 9, active: true,
    });
  });
});

const renderThenMove = async (actor: NonNullable<UserWithRelations>) => {
  const original = structuredClone(actor);
  const locations = getQuestMapLocations(actor, []);
  const group = new Group();
  const grid = { getHex: () => ({ x: 0, y: 0, width: 20, height: 20 }) } as never;
  const assets = [{ id: "tower", imageUrl: "tower.png", renderScale: 2.4 }];
  const textureForPath = () => new Texture();
  syncMapLocationSprites(group, grid, locations, assets, textureForPath);
  const sprites = [...group.children];
  const group_quest = new Group();
  for (let frame = 0; frame < 3; frame++) {
    drawQuest({ group_quest, grid, user: actor, structureObjectiveIds: new Set(locations.map((location) => location.objectiveId)) });
  }
  const client = new QueryClient();
  const key = [["profile", "getUser"], { type: "query" }];
  client.setQueryData(key, { userData: actor });
  try {
    // Sector's runJourneySegment applies this patch after ordinary same-sector walking.
    await updateUserCache(client, key, { location: "Tower trail", updatedAt: new Date(), longitude: 1, latitude: 1 });
    const moved = client.getQueryData<{ userData: typeof actor }>(key)!.userData;
    const refreshed = getQuestMapLocations(moved, []);
    syncMapLocationSprites(group, grid, refreshed, assets, textureForPath);
    expect(moved).not.toBe(actor);
    expect(moved.userQuests).toBe(actor.userQuests);
    expect(refreshed).toEqual(locations);
    expect(group.children).toEqual(sprites);
    expect(group.children).toHaveLength(locations.length * 2);
    expect(actor).toEqual(original);
    return refreshed;
  } finally {
    client.clear();
  }
};
