import { describe, expect, it, vi } from "bun:test";
import { eq, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { PetArtProviders } from "@/drizzle/constants";
import { type GameSetting, gameSetting } from "@/drizzle/schema";
import { fetchPetArtProvider, getGameSetting, initializeGameSettings, lockWithDailyTimer, lockWithHourlyTimer } from "@/libs/gamesettings";
import type { DrizzleClient } from "@/server/db";

describe("initializeGameSettings", () => {
  it("retries a safely restartable insert after an index deadlock", async () => {
    const onDuplicateKeyUpdate = vi.fn()
      .mockRejectedValueOnce(new Error("Deadlock found when trying to get lock"))
      .mockResolvedValue({ rowsAffected: 1 });
    const client = {
      insert: () => ({ values: () => ({ onDuplicateKeyUpdate }) }),
    } as unknown as DrizzleClient;

    await initializeGameSettings(client, [{ name: "cold-setting", value: 0, time: new Date(0) }]);

    expect(onDuplicateKeyUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("lockWithDailyTimer", () => {
  it("initializes one persisted row and admits one caller when the timer is absent", async () => {
    const rows = new Map<string, GameSetting>();
    const dialect = new MySqlDialect();
    const client = {
      query: { gameSetting: { findFirst: async () => {
        const row = rows.get("cold-daily");
        return row ? { ...row } : undefined;
      } } },
      insert: () => ({ values: (defaults: GameSetting[]) => ({
        onDuplicateKeyUpdate: async () => {
          for (const row of defaults) {
            if (!rows.has(row.name)) rows.set(row.name, { ...row });
          }
        },
      }) }),
      update: () => ({ set: (patch: Partial<GameSetting>) => ({
        where: async (condition: SQL) => {
          const { params } = dialect.sqlToQuery(condition);
          const row = [...rows.values()].find((candidate) => candidate.id === params[0]);
          if (!row || dialect.sqlToQuery(eq(gameSetting.time, row.time)).params[0] !== params[1]) {
            return { rowsAffected: 0 };
          }
          Object.assign(row, patch);
          return { rowsAffected: 1 };
        },
      }) }),
    } as unknown as DrizzleClient;

    const results = await Promise.all(Array.from({ length: 8 }, () => lockWithDailyTimer(client, "cold-daily")));

    expect(rows.size).toBe(1);
    expect(results.filter(({ isNewDay }) => isNewDay)).toHaveLength(1);
    expect(await getGameSetting(client, "cold-daily")).toEqual(rows.get("cold-daily")!);
  });

  it("treats the same day number in a different year as a new day", async () => {
    const now = new Date();
    const previousYear = new Date(now);
    previousYear.setUTCFullYear(now.getUTCFullYear() - 1);
    const where = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const client = {
      query: {
        gameSetting: {
          findFirst: vi.fn().mockResolvedValue({
            id: "timer-id",
            name: "cleaner-daily",
            value: 0,
            time: previousYear,
          }),
        },
      },
      update,
    } as unknown as DrizzleClient;

    const result = await lockWithDailyTimer(client, "cleaner-daily");

    expect(result.isNewDay).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("allows only one caller to claim the same daily timer", async () => {
    const previousDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let claimed = false;
    const where = vi.fn().mockImplementation(async () => {
      if (claimed) return { rowsAffected: 0 };
      claimed = true;
      return { rowsAffected: 1 };
    });
    const set = vi.fn().mockReturnValue({ where });
    const client = {
      query: {
        gameSetting: {
          findFirst: vi.fn().mockResolvedValue({
            id: "timer-id",
            name: "daily-overworld-ai",
            value: 0,
            time: previousDay,
          }),
        },
      },
      update: vi.fn().mockReturnValue({ set }),
    } as unknown as DrizzleClient;

    const results = await Promise.all([
      lockWithDailyTimer(client, "daily-overworld-ai"),
      lockWithDailyTimer(client, "daily-overworld-ai"),
    ]);

    expect(results.filter(({ isNewDay }) => isNewDay)).toHaveLength(1);
    expect(results.filter(({ isNewDay }) => !isNewDay)).toHaveLength(1);
  });
});

describe("lockWithHourlyTimer", () => {
  const createClient = (time: Date) => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const client = {
      query: {
        gameSetting: {
          findFirst: vi.fn().mockResolvedValue({
            id: "timer-id",
            name: "cleaner-hourly",
            value: 0,
            time,
          }),
        },
      },
      update,
    } as unknown as DrizzleClient;

    return { client, update };
  };

  it("waits until a full hour has elapsed", async () => {
    const { client, update } = createClient(
      new Date(Date.now() - 10 * 60 * 1000),
    );

    const result = await lockWithHourlyTimer(client, "cleaner-hourly");

    expect(result.isNewHour).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a run after an elapsed hour even when the UTC hour matches", async () => {
    const { client, update } = createClient(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    const result = await lockWithHourlyTimer(client, "cleaner-hourly");

    expect(result.isNewHour).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("fetchPetArtProvider", () => {
  it("selects the companion art provider from its game setting, defaulting to GPT", async () => {
    const client = (row?: { value: number }) => ({ query: { gameSetting: { findFirst: async () => row } } }) as unknown as DrizzleClient;
    expect(await fetchPetArtProvider(client())).toBe("GPT");
    expect(await fetchPetArtProvider(client({ value: PetArtProviders.indexOf("GPT") }))).toBe("GPT");
    expect(await fetchPetArtProvider(client({ value: PetArtProviders.indexOf("NANO_BANANA") }))).toBe("NANO_BANANA");
    expect(await fetchPetArtProvider(client({ value: 7 }))).toBe("GPT");
    expect(await fetchPetArtProvider(client({ value: 0.5 }))).toBe("GPT");
  });
});
