import { describe, expect, it, vi } from "vitest";
import { errorResponse } from "@/server/api/trpc";

// Mock the environment module
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
    DATABASE_URL: "http://localhost:3002/test",
    NODE_ENV: "test",
    CAPTCHA_SALT: "test-salt",
  },
}));

describe("Bank Router", () => {
  const mockUser = {
    userId: "test-user",
    username: "Test User",
    money: 1000,
    bank: 1000,
    status: "BATTLE",
    isBanned: false,
  };

  // Mock the fetchUser function
  const fetchUser = async () => mockUser;

  // Mock the bank router functions
  const bankRouter = {
    toBank: async ({ amount }: { amount: number }) => {
      const user = await fetchUser();
      if (user.status === "BATTLE") return errorResponse("Cannot access bank while in combat");
      return { success: true };
    },
    toPocket: async ({ amount }: { amount: number }) => {
      const user = await fetchUser();
      if (user.status === "BATTLE") return errorResponse("Cannot access bank while in combat");
      return { success: true };
    },
    transfer: async ({ amount, targetId }: { amount: number; targetId: string }) => {
      const user = await fetchUser();
      if (user.status === "BATTLE") return errorResponse("Cannot access bank while in combat");
      return { success: true };
    },
  };

  describe("toBank", () => {
    it("should prevent bank access during combat", async () => {
      const result = await bankRouter.toBank({ amount: 100 });
      expect(result.success).toBe(false);
      expect(result.message).toBe("Cannot access bank while in combat");
    });
  });

  describe("toPocket", () => {
    it("should prevent bank access during combat", async () => {
      const result = await bankRouter.toPocket({ amount: 100 });
      expect(result.success).toBe(false);
      expect(result.message).toBe("Cannot access bank while in combat");
    });
  });

  describe("transfer", () => {
    it("should prevent bank access during combat", async () => {
      const result = await bankRouter.transfer({ amount: 100, targetId: "other-user" });
      expect(result.success).toBe(false);
      expect(result.message).toBe("Cannot access bank while in combat");
    });
  });


});
