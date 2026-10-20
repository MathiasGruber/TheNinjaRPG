import { describe, expect, it } from "bun:test";
import type { FederalStatus } from "@/drizzle/constants";
import { showTrainingCapcha } from "@/libs/captcha";

const user = (federalStatus: FederalStatus, dailyTrainings: number, staffAccount = false) => ({
  federalStatus,
  dailyTrainings,
  staffAccount,
});

describe("showTrainingCapcha", () => {
  const cases: [FederalStatus, number, boolean][] = [
    ["NONE", 0, false],
    ["NONE", 8, false],
    ["NONE", 9, false],
    ["NONE", 10, true],
    ["NONE", 11, false],
    ["NONE", 12, true],
    ["NONE", 63, false],
    ["NONE", 64, true],
    ["NORMAL", 9, false],
    ["NORMAL", 10, false],
    ["NORMAL", 12, true],
    ["NORMAL", 13, false],
    ["NORMAL", 51, true],
    ["NORMAL", 52, false],
    ["SILVER", 8, false],
    ["SILVER", 10, false],
    ["SILVER", 12, true],
    ["SILVER", 14, false],
    ["SILVER", 52, true],
    ["SILVER", 53, false],
    ["GOLD", 5, false],
    ["GOLD", 10, true],
    ["GOLD", 12, false],
    ["GOLD", 15, true],
    ["GOLD", 51, false],
    ["GOLD", 55, true],
    ["GOLD", 64, false],
  ];
  it.each(cases)("%s at %i daily trainings -> %p", (status, trainings, expected) => {
    expect(showTrainingCapcha(user(status, trainings))).toBe(expected);
  });

  it("asks once every N trainings per tier once past the minimum", () => {
    const perTier = (status: FederalStatus) =>
      Array.from({ length: 60 }, (_, i) => i + 10).filter((n) =>
        showTrainingCapcha(user(status, n)),
      ).length;
    expect(perTier("NONE")).toBe(30);
    expect(perTier("NORMAL")).toBe(20);
    expect(perTier("SILVER")).toBe(15);
    expect(perTier("GOLD")).toBe(12);
  });

  it("uses the GOLD cadence for staff accounts", () => {
    expect(showTrainingCapcha(user("NONE", 12, true))).toBe(false);
    expect(showTrainingCapcha(user("NONE", 15, true))).toBe(true);
  });
});
