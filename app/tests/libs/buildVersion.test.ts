import { describe, expect, it } from "bun:test";
import {
  BUILD_RELOAD_STORAGE_KEY,
  claimBuildReload,
  isOutdatedBuild,
} from "@/libs/buildVersion";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  } as Storage;
};

describe("isOutdatedBuild", () => {
  it("flags a bundle whose build differs from the server's", () => {
    expect(isOutdatedBuild("aaa", "bbb")).toBe(true);
    expect(isOutdatedBuild("aaa", "aaa")).toBe(false);
  });

  it("ignores missing headers and builds without a commit", () => {
    expect(isOutdatedBuild("aaa", null)).toBe(false);
    expect(isOutdatedBuild("aaa", "")).toBe(false);
    expect(isOutdatedBuild("aaa", "unknown")).toBe(false);
    expect(isOutdatedBuild("unknown", "bbb")).toBe(false);
  });
});

describe("claimBuildReload", () => {
  it("allows one reload per server build and tab", () => {
    const storage = memoryStorage();
    expect(claimBuildReload(storage, "bbb")).toBe(true);
    expect(storage.getItem(BUILD_RELOAD_STORAGE_KEY)).toBe("bbb");
    // The reload came back with the old bundle: do not loop.
    expect(claimBuildReload(storage, "bbb")).toBe(false);
    // A later deploy gets its own attempt.
    expect(claimBuildReload(storage, "ccc")).toBe(true);
  });

  it("never reloads when storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    } as unknown as Storage;
    expect(claimBuildReload(storage, "bbb")).toBe(false);
  });
});
