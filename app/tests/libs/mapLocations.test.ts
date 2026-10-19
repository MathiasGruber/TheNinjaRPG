import { describe, expect, it } from "bun:test";
import { getQuestMapLocations, groupMapLocations, publicQuestLocations } from "@/libs/mapLocations";
import type { UserWithRelations } from "@/routers/profile";
import { DialogObjective, MoveToObjective } from "@/validators/objectives";

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
  it("retains the building when arrival advances to a dialog at the same location", () => {
    const result = getQuestMapLocations(user([
      { ...arrival, done: true, selectedNextObjectiveId: "dialog" },
      { ...arrival, id: "dialog" },
    ]), []);
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
