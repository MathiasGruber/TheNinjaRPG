import { describe, expect, test, vi } from "vitest";
import {
  canChallengeKage,
  canBeElder,
  isKage,
  updateKagePrestige,
  convertToKagePrestige,
} from "@/utils/kage";
import {
  KAGE_PRESTIGE_REQUIREMENT,
  KAGE_RANK_REQUIREMENT,
  KAGE_MIN_DAYS_IN_VILLAGE,
  KAGE_ELDER_MIN_DAYS,
  KAGE_DAILY_PRESTIGE_LOSS,
  KAGE_MIN_PRESTIGE,
} from "@/drizzle/constants";
import type { UserData, KagePrestige } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";

describe("canChallengeKage", () => {
  test("should return true when all requirements are met", () => {
    const user = {
      villagePrestige: KAGE_PRESTIGE_REQUIREMENT,
      rank: KAGE_RANK_REQUIREMENT,
      villageJoinedAt: new Date(Date.now() - (KAGE_MIN_DAYS_IN_VILLAGE + 1) * 24 * 3600 * 1000),
    } as UserData;

    expect(canChallengeKage(user)).toBe(true);
  });

  test("should return false when prestige is too low", () => {
    const user = {
      villagePrestige: KAGE_PRESTIGE_REQUIREMENT - 1,
      rank: KAGE_RANK_REQUIREMENT,
      villageJoinedAt: new Date(Date.now() - (KAGE_MIN_DAYS_IN_VILLAGE + 1) * 24 * 3600 * 1000),
    } as UserData;

    expect(canChallengeKage(user)).toBe(false);
  });

  test("should return false when rank is too low", () => {
    const user = {
      villagePrestige: KAGE_PRESTIGE_REQUIREMENT,
      rank: "CHUNIN",
      villageJoinedAt: new Date(Date.now() - (KAGE_MIN_DAYS_IN_VILLAGE + 1) * 24 * 3600 * 1000),
    } as UserData;

    expect(canChallengeKage(user)).toBe(false);
  });

  test("should return false when not in village long enough", () => {
    const user = {
      villagePrestige: KAGE_PRESTIGE_REQUIREMENT,
      rank: KAGE_RANK_REQUIREMENT,
      villageJoinedAt: new Date(Date.now() - (KAGE_MIN_DAYS_IN_VILLAGE - 1) * 24 * 3600 * 1000),
    } as UserData;

    expect(canChallengeKage(user)).toBe(false);
  });
});

describe("canBeElder", () => {
  test("should return true when in village long enough", () => {
    const user = {
      villageJoinedAt: new Date(Date.now() - (KAGE_ELDER_MIN_DAYS + 1) * 24 * 3600 * 1000),
    } as UserData;

    expect(canBeElder(user)).toBe(true);
  });

  test("should return false when not in village long enough", () => {
    const user = {
      villageJoinedAt: new Date(Date.now() - (KAGE_ELDER_MIN_DAYS - 1) * 24 * 3600 * 1000),
    } as UserData;

    expect(canBeElder(user)).toBe(false);
  });
});

describe("isKage", () => {
  test("should return true when user is kage", () => {
    const user = {
      userId: "123",
      village: {
        kageId: "123",
      },
    } as NonNullable<UserWithRelations>;

    expect(isKage(user)).toBe(true);
  });

  test("should return false when user is not kage", () => {
    const user = {
      userId: "123",
      village: {
        kageId: "456",
      },
    } as NonNullable<UserWithRelations>;

    expect(isKage(user)).toBe(false);
  });

  test("should return false when user has no village", () => {
    const user = {
      userId: "123",
      village: null,
    } as NonNullable<UserWithRelations>;

    expect(isKage(user)).toBe(false);
  });
});

describe("updateKagePrestige", () => {
  test("should not reduce prestige if less than a day has passed", async () => {
    const now = new Date();
    const kagePrestige = {
      id: "123",
      prestige: 5000,
      lastPrestigeUpdate: now,
    } as KagePrestige;

    const mockClient = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    };

    const result = await updateKagePrestige(mockClient as any, kagePrestige);
    expect(result.prestige).toBe(5000);
    expect(result.shouldRemove).toBe(false);
    expect(mockClient.update).not.toHaveBeenCalled();
  });

  test("should reduce prestige by daily amount", async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const kagePrestige = {
      id: "123",
      prestige: 5000,
      lastPrestigeUpdate: oneDayAgo,
    } as KagePrestige;

    const mockClient = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    };

    const result = await updateKagePrestige(mockClient as any, kagePrestige);
    expect(result.prestige).toBe(5000 - KAGE_DAILY_PRESTIGE_LOSS);
    expect(result.shouldRemove).toBe(false);
    expect(mockClient.update).toHaveBeenCalled();
  });

  test("should indicate removal when prestige drops below minimum", async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const kagePrestige = {
      id: "123",
      prestige: KAGE_MIN_PRESTIGE + KAGE_DAILY_PRESTIGE_LOSS / 2,
      lastPrestigeUpdate: oneDayAgo,
    } as KagePrestige;

    const mockClient = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    };

    const result = await updateKagePrestige(mockClient as any, kagePrestige);
    expect(result.prestige).toBe(KAGE_MIN_PRESTIGE - KAGE_DAILY_PRESTIGE_LOSS / 2);
    expect(result.shouldRemove).toBe(true);
    expect(mockClient.update).toHaveBeenCalled();
  });
});

describe("convertToKagePrestige", () => {
  test("should add to existing prestige", async () => {
    const mockClient = {
      query: {
        kagePrestige: {
          findFirst: vi.fn().mockResolvedValue({ prestige: 5000 }),
        },
      },
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    };

    const result = await convertToKagePrestige(mockClient as any, "123", "456", 1000);
    expect(result).toBe(6000);
    expect(mockClient.update).toHaveBeenCalled();
  });

  test("should create new prestige record if none exists", async () => {
    const mockClient = {
      query: {
        kagePrestige: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    };

    const result = await convertToKagePrestige(mockClient as any, "123", "456", 1000);
    expect(result).toBe(6000);
    expect(mockClient.insert).toHaveBeenCalled();
  });
});
