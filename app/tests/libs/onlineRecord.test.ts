import { describe, expect, it } from "bun:test";
import { isNewOnlineRecord } from "@/libs/onlineRecord";

describe("isNewOnlineRecord", () => {
  it("accepts gradual growth above the stored record", () => {
    expect(isNewOnlineRecord(300, 301)).toBe(true);
    expect(isNewOnlineRecord(300, 600)).toBe(true);
  });

  it("ignores counts at or below the stored record", () => {
    expect(isNewOnlineRecord(300, 300)).toBe(false);
    expect(isNewOnlineRecord(300, 12)).toBe(false);
  });

  it("lets a small or reset record grow by a fixed headroom", () => {
    expect(isNewOnlineRecord(0, 100)).toBe(true);
    expect(isNewOnlineRecord(20, 120)).toBe(true);
    expect(isNewOnlineRecord(0, 101)).toBe(false);
  });

  // A bulk `updatedAt` write makes every account look online at once.
  it("rejects a jump that only a bulk write could produce", () => {
    expect(isNewOnlineRecord(600, 48491)).toBe(false);
    expect(isNewOnlineRecord(600, 1201)).toBe(false);
  });
});
