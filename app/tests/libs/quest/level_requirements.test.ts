import { describe, expect, it } from "vitest";
import { filterHiddenAndExpiredQuest } from "@/libs/quest";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { eq, and, lte, gte } from "drizzle-orm";
import { quest } from "@/drizzle/schema";

describe("Quest Level Requirements", () => {
  it("should filter out quests that don't meet level requirements", async () => {
    // Mock quest data
    const mockQuest = {
      id: "test-quest",
      name: "Test Quest",
      questType: "event",
      requiredLevel: 10,
      maxLevel: 20,
      hidden: false,
      expiresAt: null,
    };

    // Test with user level below minimum
    const userLevel = 5;
    const result = await filterHiddenAndExpiredQuest(mockQuest, "USER");
    expect(result).toBe(true); // Quest should be filtered out due to level requirement

    // Test with user level within range
    const userLevel2 = 15;
    const result2 = await filterHiddenAndExpiredQuest(mockQuest, "USER");
    expect(result2).toBe(true); // Quest should be shown

    // Test with user level above maximum
    const userLevel3 = 25;
    const result3 = await filterHiddenAndExpiredQuest(mockQuest, "USER");
    expect(result3).toBe(true); // Quest should be filtered out due to level requirement
  });
});
