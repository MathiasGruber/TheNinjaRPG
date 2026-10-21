import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { PVP_EXPERIENCE_AVERAGE_SETTING } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";
import {
  fetchPvpExperienceAverage,
  resetPvpExperienceAverageCache,
} from "@/server/utils/pvpExperience";

const start = new Date("2026-10-21T12:00:00Z");

/** Fake client whose average query resolves to the next queued value. */
const fakeClient = (averages: number[]) => {
  let queries = 0;
  const client = {
    select: () => ({
      from: () => ({
        where: async () => [{ average: averages[queries++] ?? 0 }],
      }),
    }),
  } as unknown as Pick<DrizzleClient, "select">;
  return { client, queries: () => queries };
};

describe("fetchPvpExperienceAverage instance cache", () => {
  beforeEach(() => {
    resetPvpExperienceAverageCache();
    setSystemTime(start);
  });
  afterEach(() => {
    setSystemTime();
    resetPvpExperienceAverageCache();
  });

  it("serves repeat calls within the TTL from one query", async () => {
    const { client, queries } = fakeClient([1000, 2000]);
    const first = await fetchPvpExperienceAverage(client);
    setSystemTime(new Date(start.getTime() + 4 * 60 * 1000));
    const second = await fetchPvpExperienceAverage(client);
    expect(queries()).toBe(1);
    expect(first).toMatchObject({ name: PVP_EXPERIENCE_AVERAGE_SETTING, value: 1000 });
    expect(second.value).toBe(1000);
  });

  it("shares one query between concurrent misses", async () => {
    const { client, queries } = fakeClient([1000, 2000]);
    const results = await Promise.all([
      fetchPvpExperienceAverage(client),
      fetchPvpExperienceAverage(client),
    ]);
    expect(queries()).toBe(1);
    expect(results.map((r) => r.value)).toEqual([1000, 1000]);
  });

  it("re-queries once the TTL has passed", async () => {
    const { client, queries } = fakeClient([1000, 2000]);
    await fetchPvpExperienceAverage(client);
    setSystemTime(new Date(start.getTime() + 5 * 60 * 1000));
    const refreshed = await fetchPvpExperienceAverage(client);
    expect(queries()).toBe(2);
    expect(refreshed.value).toBe(2000);
  });

  it("does not cache a failed query", async () => {
    let calls = 0;
    const client = {
      select: () => ({
        from: () => ({
          where: async () => {
            calls += 1;
            if (calls === 1) throw new Error("connection dropped");
            return [{ average: 1500 }];
          },
        }),
      }),
    } as unknown as Pick<DrizzleClient, "select">;
    await expect(fetchPvpExperienceAverage(client)).rejects.toThrow("connection dropped");
    expect((await fetchPvpExperienceAverage(client)).value).toBe(1500);
    expect(calls).toBe(2);
  });
});
