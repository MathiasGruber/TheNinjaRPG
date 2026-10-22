import {
  resetServerModuleStubs,
  stubCronAuth,
  stubDatabase,
} from "../../../setup/serverModules";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";

type PvpResetTestMocks = {
  dailyLock: ReturnType<typeof vi.fn>;
  weeklyLock: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  handleError: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updates: { table: unknown; set: Record<string, unknown> }[];
};

/** Returns Bun-compatible module mocks shared by the hoisted route factories. */
function getPvpResetTestMocks(): PvpResetTestMocks {
  const globals = globalThis as unknown as { __pvpResetTestMocks?: PvpResetTestMocks };
  globals.__pvpResetTestMocks ??= {
    dailyLock: vi.fn(),
    weeklyLock: vi.fn(),
    rollback: vi.fn(),
    handleError: vi.fn(),
    update: vi.fn(),
    updates: [],
  };
  return globals.__pvpResetTestMocks;
}

const mocks = getPvpResetTestMocks();

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/libs/gamesettings", () => ({
  lockWithDailyTimer: getPvpResetTestMocks().dailyLock,
  lockWithWeeklyTimer: getPvpResetTestMocks().weeklyLock,
  handleEndpointError: getPvpResetTestMocks().handleError,
}));
import { GET as dailyPvp } from "@/app/api/daily-pvp/route";
import { GET as weeklyPvp } from "@/app/api/weekly-pvp/route";
import { userData } from "@/drizzle/schema";

const cronRequest = (path: string) =>
  new Request(`https://example.com/api/${path}`, {
    headers: { authorization: "Bearer test-cron" },
  });

const userDataSets = () =>
  mocks.updates.filter((u) => u.table === userData).map((u) => u.set);

describe("PvP reset crons", () => {
  afterEach(resetServerModuleStubs);

  beforeEach(() => {
    stubCronAuth(() => null);
    stubDatabase({ update: getPvpResetTestMocks().update });
    for (const mock of [
      mocks.dailyLock,
      mocks.weeklyLock,
      mocks.rollback,
      mocks.handleError,
      mocks.update,
    ]) {
      mock.mockReset();
    }
    mocks.updates.length = 0;
    mocks.dailyLock.mockResolvedValue({ release: mocks.rollback, isNewDay: true, prevTime: 1 });
    mocks.weeklyLock.mockResolvedValue({ release: mocks.rollback, isNewWeek: true, prevTime: 1 });
    // Bulk updates are awaited either directly or after .where().
    mocks.update.mockImplementation((table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        mocks.updates.push({ table, set });
        const result = Promise.resolve({ rowsAffected: 1 });
        return Object.assign(result, {
          where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
        });
      },
    }));
  });

  // updatedAt is every player's last activity: online counts, the online record,
  // inactive-account cleanup and sector lists all read it. A bulk bump marks every
  // account as online at once.
  it("daily decay does not mark every player as recently active", async () => {
    const response = await dailyPvp(cronRequest("daily-pvp"));

    expect(await response.json()).toBe("OK");
    const [decay] = userDataSets();
    expect(decay).toHaveProperty("pvpExperience");
    expect(decay).toHaveProperty("pvpExperienceDecayAt");
    expect(decay).not.toHaveProperty("updatedAt");
    expect(mocks.rollback).not.toHaveBeenCalled();
  });

  it("weekly kill reset does not mark every player as recently active", async () => {
    const response = await weeklyPvp(cronRequest("weekly-pvp"));

    expect(await response.json()).toBe("OK");
    const [reset] = userDataSets();
    expect(reset).toMatchObject({ weeklyPvpKills: 0 });
    expect(reset).not.toHaveProperty("updatedAt");
    expect(mocks.rollback).not.toHaveBeenCalled();
  });
});
