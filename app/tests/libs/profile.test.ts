// sum.test.js
import { expect, test } from "vitest";
import { calcLevelRequirements, calcLevel } from "@/libs/profile";

test("Confirm that level<->experience calculations are consistent", () => {
  for (const level of [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  ]) {
    const exp = calcLevelRequirements(level);
    const lvl = calcLevel(exp);
    expect(lvl).toBe(level);
  }
});
