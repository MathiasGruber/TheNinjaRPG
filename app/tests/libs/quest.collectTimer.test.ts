import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { getCollectDeadline } from "@/libs/gathering";
import { getNewTrackers } from "@/libs/quest";
import { DecreaseGatheringTime } from "@/validators/combat";

// Timed collect_item objectives are gated server-side on the elapsed time since the
// tracker's `timestamp`, measured with Date.now(); the clock is a spy so each case can
// place the request exactly relative to the deadline. (The timestamp itself is written
// with `new Date()`, which the spy does not cover.)
const START = Date.UTC(2026, 8, 16, 12, 0, 0);
let nowMs = START;

beforeEach(() => {
  nowMs = START;
  vi.spyOn(Date, "now").mockImplementation(() => nowMs);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const makeCollectUser = (collectTimeMinutes: number, timestamp?: string) => {
  const location = { sector: 1, longitude: 1, latitude: 1 };
  const objective = {
    id: "collect",
    task: "collect_item",
    ...location,
    collectItemIds: ["collected-item"],
    item_name: "Herb",
    collect_time_minutes: collectTimeMinutes,
  };
  const quest = {
    id: "timed-collect-quest",
    name: "Timed collect quest",
    questType: "mission",
    hidden: false,
    consecutiveObjectives: false,
    maxAttempts: 100,
    maxCompletes: 100,
    retryDelay: "none",
    requiredVillage: null,
    content: { objectives: [objective], reward: {} },
  };
  return {
    userId: "collector",
    level: 50,
    rank: "JONIN",
    role: "USER",
    villageId: "v1",
    isOutlaw: false,
    bloodlineId: null,
    ...location,
    status: "AWAKE",
    village: { id: "v1", sector: 1 },
    activeWars: [],
    completedQuests: [],
    useritems: [],
    questData: [
      {
        id: quest.id,
        startAt: "2026-01-01T00:00:00.000Z",
        goals: [{ id: objective.id, ...(timestamp ? { timestamp } : {}) }],
      },
    ],
    userQuests: [{ id: "history", questId: quest.id, completed: 0, quest }],
  } as unknown as Parameters<typeof getNewTrackers>[0];
};

const evaluate = (user: Parameters<typeof getNewTrackers>[0]) => {
  const result = getNewTrackers(user, [{ task: "collect_item" }]);
  const goal = result.trackers[0]?.goals.find(({ id }) => id === "collect");
  const granted = result.consequences.some(
    (c) => c.type === "add_item" && c.ids?.includes("collected-item"),
  );
  return { goal, granted, result };
};

describe("getNewTrackers — timed collect_item", () => {
  it("starts the timer on first arrival instead of granting the item", () => {
    const { goal, granted, result } = evaluate(makeCollectUser(0.5));
    expect(goal?.done).toBeUndefined();
    expect(Number.isFinite(Date.parse(goal?.timestamp ?? ""))).toBe(true);
    expect(granted).toBe(false);
    expect(result.notifications.some((n) => n.includes("started collecting"))).toBe(true);
  });

  it("rejects a request that arrives just before the deadline", () => {
    const startedAt = new Date(START).toISOString();
    nowMs = START + 30_000 - 1;
    const { goal, granted } = evaluate(makeCollectUser(0.5, startedAt));
    expect(goal?.done).toBeUndefined();
    expect(granted).toBe(false);
  });

  it("grants the item at the exact deadline, when the client countdown fires onFinish", () => {
    const startedAt = new Date(START).toISOString();
    nowMs = START + 30_000;
    const { goal, granted } = evaluate(makeCollectUser(0.5, startedAt));
    expect(goal?.done).toBe(true);
    expect(granted).toBe(true);
  });

  it("does not round a fractional-second deadline up to the next whole second", () => {
    // 0.301 min = 18.06 s. A floored elapsed-seconds compare would hold this until 19 s.
    const startedAt = new Date(START).toISOString();
    nowMs = START + 18_500;
    const { goal, granted } = evaluate(makeCollectUser(0.301, startedAt));
    expect(goal?.done).toBe(true);
    expect(granted).toBe(true);
  });
});

const withGatheringBonus = (power = 10) => {
  const player = makeCollectUser(1);
  player.userQuests[0]!.quest.questType = "gathering";
  player.bloodline = {
    effects: [DecreaseGatheringTime.parse({ power })],
  } as NonNullable<typeof player.bloodline>;
  return player;
};

describe("gathering collection snapshots", () => {
  it("saves the reduced deadline and checks its exact completion boundary", () => {
    const player = withGatheringBonus();
    const first = evaluate(player);
    expect(first.goal?.collectDeadline).toBe(new Date(START + 50_000).toISOString());
    player.questData = first.result.trackers;
    nowMs = START + 49_999;
    expect(evaluate(player).granted).toBe(false);
    nowMs += 1;
    expect(evaluate(player).granted).toBe(true);
    expect(getCollectDeadline(first.goal!, 1)).toEqual(new Date(START + 50_000));
  });
  it("does not recalculate a running timer after passive bonuses change", () => {
    const player = withGatheringBonus();
    const first = evaluate(player);
    player.questData = first.result.trackers;
    player.bloodline!.effects = [DecreaseGatheringTime.parse({ power: 59 })];
    nowMs = START + 1000;
    expect(evaluate(player).granted).toBe(false);
    expect(evaluate(player).goal?.collectDeadline).toBe(first.goal?.collectDeadline);
    nowMs = START + 50_000;
    expect(evaluate(player).granted).toBe(true);
  });
  it("leaves old timers at their original duration", () => {
    const player = withGatheringBonus(59);
    player.questData![0]!.goals[0]!.timestamp = new Date(START).toISOString();
    nowMs = START + 59_999;
    expect(evaluate(player).granted).toBe(false);
    expect(evaluate(player).goal?.collectDeadline).toBeUndefined();
    nowMs += 1;
    expect(evaluate(player).granted).toBe(true);
  });
  it("clears both fields on departure and captures a new bonus on return", () => {
    const player = withGatheringBonus();
    player.questData = evaluate(player).result.trackers;
    player.longitude = 2;
    const left = evaluate(player);
    expect(left.goal?.timestamp).toBeUndefined();
    expect(left.goal?.collectDeadline).toBeUndefined();
    player.questData = left.result.trackers;
    player.longitude = 1;
    player.bloodline!.effects = [DecreaseGatheringTime.parse({ power: 20 })];
    nowMs = START + 2000;
    expect(evaluate(player).goal?.collectDeadline).toBe(
      new Date(START + 42_000).toISOString(),
    );
  });
  it("keeps unrelated quests and untimed objectives unchanged", () => {
    const player = withGatheringBonus();
    player.userQuests[0]!.quest.questType = "mission";
    expect(evaluate(player).goal?.collectDeadline).toBe(
      new Date(START + 60_000).toISOString(),
    );
    const untimed = makeCollectUser(0);
    expect(evaluate(untimed).granted).toBe(true);
    expect(evaluate(untimed).goal?.collectDeadline).toBeUndefined();
  });
  it("clamps gathering to one second", () => {
    expect(evaluate(withGatheringBonus(100)).goal?.collectDeadline).toBe(
      new Date(START + 1000).toISOString(),
    );
  });
});
