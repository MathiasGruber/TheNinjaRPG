import { expect, test, describe, beforeEach, vi } from "vitest";
import { createTestContext } from "../helpers";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { linkPromotion, userData } from "@/drizzle/schema";

vi.mock("@/env/client.mjs", () => ({
  env: {
    NEXT_PUBLIC_PUSHER_APP_KEY: "test-key",
    NEXT_PUBLIC_PUSHER_APP_CLUSTER: "test-cluster",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_NODE_ENV: "test",
  },
}));

vi.mock("@/env/server.mjs", () => ({
  env: {
    PUSHER_APP_ID: "test-id",
    PUSHER_APP_SECRET: "test-secret",
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    NODE_ENV: "test",
    CAPTCHA_SALT: "test-salt",
    OPENAI_API_KEY: "test-key",
    UPSTASH_REDIS_REST_URL: "http://localhost:3003",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
  },
}));

vi.mock("openai", () => {
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    moderations: {
      create: vi.fn().mockResolvedValue({
        results: [{ flagged: false }],
      }),
    },
  }));
  return { default: MockOpenAI };
});

vi.mock("@upstash/redis", () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
  }));
  MockRedis.fromEnv = vi.fn().mockReturnValue(new MockRedis());
  return { Redis: MockRedis };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "test-user" }),
}));

vi.mock("@/server/db", () => {
  const mockDb = {
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      })),
    })),
    query: {
      userData: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      linkPromotion: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };

  mockDb.transaction = vi.fn().mockImplementation(async (callback) => {
    return callback(mockDb);
  });

  return { drizzleDB: mockDb };
});

describe("Link Promotion API", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  test("User can submit link promotion", async () => {
    const userId = nanoid();
    const mockUser = {
      userId,
      username: "test",
      role: "USER",
    };

    const mockInsert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    }));

    vi.spyOn(ctx.drizzle, "insert").mockImplementation(mockInsert);

    const result = await ctx.caller.profile.submitLinkPromotion({
      url: "https://example.com",
    });

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith(linkPromotion);
  });

  test("Admin can review link promotion", async () => {
    const userId = nanoid();
    const adminId = nanoid();
    const promotionId = nanoid();

    const mockAdmin = {
      userId: adminId,
      username: "admin",
      role: "CODING-ADMIN",
    };
    const mockPromotion = {
      id: promotionId,
      userId,
      url: "https://example.com",
      status: "PENDING",
    };

    const mockQuery = {
      userData: {
        findFirst: vi.fn().mockResolvedValue(mockAdmin),
      },
      linkPromotion: {
        findFirst: vi.fn().mockResolvedValue(mockPromotion),
      },
    };

    const mockUpdate = vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      })),
    }));

    const mockTx = {
      update: mockUpdate,
    };

    vi.spyOn(ctx.drizzle, "query", "get").mockReturnValue(mockQuery);
    vi.spyOn(ctx.drizzle, "transaction").mockImplementation(async (callback) => {
      await callback(mockTx as any);
      return { rowsAffected: 1 };
    });

    const result = await ctx.caller.profile.reviewLinkPromotion({
      id: promotionId,
      points: 50,
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("Awarded 50 reputation points");
  });

  test("Non-admin cannot review link promotion", async () => {
    const userId = nanoid();
    const promotionId = nanoid();

    const mockUser = {
      userId,
      username: "test",
      role: "USER",
    };
    const mockPromotion = {
      id: promotionId,
      userId,
      url: "https://example.com",
      status: "PENDING",
    };

    const mockQuery = {
      userData: {
        findFirst: vi.fn().mockResolvedValue(mockUser),
      },
      linkPromotion: {
        findFirst: vi.fn().mockResolvedValue(mockPromotion),
      },
    };

    const mockTransaction = vi.fn();

    vi.spyOn(ctx.drizzle, "query", "get").mockReturnValue(mockQuery);
    vi.spyOn(ctx.drizzle, "transaction").mockImplementation(mockTransaction);

    const result = await ctx.caller.profile.reviewLinkPromotion({
      id: promotionId,
      points: 50,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Not authorized to review link promotions");
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
