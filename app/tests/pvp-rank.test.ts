import { describe, expect, it } from "vitest";
import { appRouter } from "../src/server/api/root";
import { vi } from "vitest";

const mockDrizzle = {
  query: {
    pvpRankTable: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    pvpLoadoutTable: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(),
    })),
  })),
};


describe("PVP Rank System", () => {
  const ctx = {
    drizzle: mockDrizzle,
    userIp: "127.0.0.1",
    userId: "test-user",
    userAgent: "test-agent",
  };

  const caller = appRouter.createCaller(ctx);

  it("should enter queue", async () => {
    mockDrizzle.query.pvpRankTable.findFirst.mockResolvedValueOnce(null);
    mockDrizzle.insert().values().onConflictDoUpdate.mockResolvedValueOnce(undefined);

    const result = await caller.pvpRank.enterQueue();
    expect(result.success).toBe(true);
  });

  it("should save loadout", async () => {
    const loadout = {
      jutsu: ["fireball", "shadow-clone"],
      weapons: ["kunai"],
      consumables: ["health-potion"],
    };

    mockDrizzle.insert().values().onConflictDoUpdate.mockResolvedValueOnce(undefined);
    mockDrizzle.query.pvpLoadoutTable.findFirst.mockResolvedValueOnce(loadout);

    const result = await caller.pvpRank.saveLoadout(loadout);
    expect(result.success).toBe(true);

    const savedLoadout = await caller.pvpRank.getLoadout();
    expect(savedLoadout).toMatchObject(loadout);
  });

  it("should get rank info", async () => {
    const mockRankInfo = {
      rank: "Wood",
      lp: 150,
      winStreak: 0,
      lastMatchDate: new Date(),
    };

    mockDrizzle.query.pvpRankTable.findFirst.mockResolvedValueOnce(mockRankInfo);
    mockDrizzle.query.pvpRankTable.findMany.mockResolvedValueOnce([]);

    const rankInfo = await caller.pvpRank.getRankInfo();
    expect(rankInfo).toHaveProperty("rank");
    expect(rankInfo).toHaveProperty("lp");
    expect(rankInfo).toHaveProperty("winStreak");
    expect(rankInfo).toHaveProperty("isSannin");
  });

  it("should leave queue", async () => {
    mockDrizzle.update().set().where.mockResolvedValueOnce(undefined);

    const result = await caller.pvpRank.leaveQueue();
    expect(result.success).toBe(true);
  });
});
