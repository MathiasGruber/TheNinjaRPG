import { describe, expect, it } from "bun:test";
import { isNewOnlineRecord } from "@/libs/onlineRecord";

describe("isNewOnlineRecord", () => {
  it("accepts gradual growth above the stored record", () => {
    expect(isNewOnlineRecord(300, 301)).toBe(true);
    expect(isNewOnlineRecord(300, 310)).toBe(true);
    expect(isNewOnlineRecord(300, 350)).toBe(true);
  });

  it("ignores counts at or below the stored record", () => {
    expect(isNewOnlineRecord(300, 300)).toBe(false);
    expect(isNewOnlineRecord(300, 12)).toBe(false);
  });

  it("uses the same 50-user allowance for small or reset records", () => {
    expect(isNewOnlineRecord(0, 50)).toBe(true);
    expect(isNewOnlineRecord(20, 70)).toBe(true);
    expect(isNewOnlineRecord(0, 51)).toBe(false);
    expect(isNewOnlineRecord(20, 71)).toBe(false);
  });

  // A bulk `updatedAt` write makes every account look online at once.
  it("rejects increases beyond 50 users, including bulk activity spikes", () => {
    expect(isNewOnlineRecord(600, 48491)).toBe(false);
    expect(isNewOnlineRecord(300, 351)).toBe(false);
    expect(isNewOnlineRecord(600, 651)).toBe(false);
  });
});
