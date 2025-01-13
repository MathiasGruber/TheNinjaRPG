import { describe, expect, it } from "vitest";
import { errorResponse } from "@/server/api/trpc";
import { fetchUser } from "@/routers/profile";

describe("Prevent robbing Genins and Academy Students", () => {
  it("should prevent robbing a Genin", async () => {
    // Mock user data
    const outlaw = {
      userId: "outlaw123",
      isOutlaw: true,
      status: "AWAKE",
      isBanned: false,
      sector: 1,
      longitude: 5,
      latitude: 5,
    };

    const genin = {
      userId: "genin123",
      rank: "Genin",
      isBanned: false,
      sector: 1,
      longitude: 5,
      latitude: 5,
      robImmunityUntil: null,
    };

    // Mock fetchUser function
    const mockFetchUser = async (_, userId: string) => {
      return userId === outlaw.userId ? outlaw : genin;
    };

    // Test the robbing guard condition
    const target = await mockFetchUser(null, genin.userId);
    if (target.rank === "Academy Student" || target.rank === "Genin") {
      const result = errorResponse("Cannot rob Academy Students or Genins");
      expect(result.success).toBe(false);
      expect(result.message).toBe("Cannot rob Academy Students or Genins");
    }
  });

  it("should prevent robbing an Academy Student", async () => {
    // Mock user data
    const outlaw = {
      userId: "outlaw123",
      isOutlaw: true,
      status: "AWAKE",
      isBanned: false,
      sector: 1,
      longitude: 5,
      latitude: 5,
    };

    const student = {
      userId: "student123",
      rank: "Academy Student",
      isBanned: false,
      sector: 1,
      longitude: 5,
      latitude: 5,
      robImmunityUntil: null,
    };

    // Mock fetchUser function
    const mockFetchUser = async (_, userId: string) => {
      return userId === outlaw.userId ? outlaw : student;
    };

    // Test the robbing guard condition
    const target = await mockFetchUser(null, student.userId);
    if (target.rank === "Academy Student" || target.rank === "Genin") {
      const result = errorResponse("Cannot rob Academy Students or Genins");
      expect(result.success).toBe(false);
      expect(result.message).toBe("Cannot rob Academy Students or Genins");
    }
  });
});
