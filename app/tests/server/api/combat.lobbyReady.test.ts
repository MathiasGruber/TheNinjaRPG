import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { battle } from "@/drizzle/schema";
import type { CompleteBattle } from "@/libs/combat/types";
import { Pusher } from "@/libs/pusher";
import { combatRouter } from "@/server/api/routers/combat";
import type { DrizzleClient } from "@/server/db";
import {
  makeBattleUser,
  makeCompleteBattle,
} from "../../libs/combat/helpers/battleScenario";
import { callerForDatabase } from "../../setup/testDatabase";

const USER = "ready-player";
const BATTLE = "ready-lobby";
const lobby = () =>
  makeCompleteBattle({
    id: BATTLE,
    version: 1,
    createdAt: new Date(Date.now() - 30_000),
    roundStartAt: new Date(Date.now() + 60_000),
    usersState: [
      makeBattleUser(USER, { iAmHere: false, isAi: false }),
      makeBattleUser("other-player", { iAmHere: false, isAi: false }),
    ],
  });

type Conflict = (current: CompleteBattle) => CompleteBattle | null;
type ReadyUpdate = Pick<
  CompleteBattle,
  "usersState" | "version" | "createdAt" | "updatedAt" | "roundStartAt"
>;

/** Inject a competing write between each read and CAS, keeping reads as independent snapshots. */
const readyHarness = (
  initial: CompleteBattle | null = lobby(),
  conflicts: Conflict[] = [],
) => {
  let saved = structuredClone(initial);
  const findFirst = vi.fn(async () => structuredClone(saved));
  const writes: { values: ReadyUpdate; version: unknown }[] = [];
  const dialect = new MySqlDialect();
  const client = {
    query: { battle: { findFirst } },
    update: (table: object) => {
      expect(table).toBe(battle);
      return {
        set: (values: ReadyUpdate) => ({
          where: async (condition: SQL) => {
            const query = dialect.sqlToQuery(condition);
            expect(query.sql).toBe("(`Battle`.`id` = ? and `Battle`.`version` = ?)");
            expect(query.params[0]).toBe(BATTLE);
            writes.push({ values: structuredClone(values), version: query.params[1] });
            const conflict = conflicts.shift();
            if (conflict) {
              saved = conflict(structuredClone(saved!));
              return { rowsAffected: 0 };
            }
            if (!saved || saved.version !== query.params[1]) return { rowsAffected: 0 };
            Object.assign(saved, structuredClone(values));
            return { rowsAffected: 1 };
          },
        }),
      };
    },
  } as unknown as DrizzleClient;
  return {
    call: () =>
      callerForDatabase(combatRouter, USER, client).iAmHere({ battleId: BATTLE }),
    findFirst,
    writes,
    saved: () => saved,
  };
};

describe("combat lobby readiness retries", () => {
  beforeEach(() => vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined));
  afterEach(() => vi.restoreAllMocks());

  it("keeps the uncontended path at one read and one guarded write", async () => {
    const initial = lobby();
    const harness = readyHarness(initial);
    expect(await harness.call()).toMatchObject({
      success: true,
      message: "",
      battle: { version: 2 },
    });
    expect(harness.findFirst).toHaveBeenCalledTimes(1);
    expect(harness.writes.map((write) => write.version)).toEqual([1]);
    expect(harness.saved()?.roundStartAt).toEqual(initial.roundStartAt);
    expect(harness.saved()?.usersState.map((user) => user.iAmHere)).toEqual([
      true,
      false,
    ]);
    expect(Pusher.prototype.trigger).toHaveBeenCalledTimes(1);
  });

  it("retries the conflict snapshot and preserves concurrent participant changes", async () => {
    const initial = lobby();
    const harness = readyHarness(initial, [
      (current) => {
        current.version++;
        current.usersState[1]!.iAmHere = true;
        current.usersState[1]!.curHealth = 1234;
        current.usersState[0]!.actionPoints = 42;
        return current;
      },
    ]);
    const result = await harness.call();
    expect(result).toMatchObject({ success: true, battle: { version: 3 } });
    expect(harness.findFirst).toHaveBeenCalledTimes(2);
    expect(harness.writes.map((write) => write.version)).toEqual([1, 2]);
    expect(harness.saved()?.usersState.map((user) => user.iAmHere)).toEqual([
      true,
      true,
    ]);
    expect(harness.saved()?.usersState[0]!.actionPoints).toBe(42);
    expect(harness.saved()?.usersState[1]!.curHealth).toBe(1234);
    expect(harness.saved()!.roundStartAt.getTime()).toBeLessThan(
      initial.roundStartAt.getTime(),
    );
    expect(harness.saved()!.createdAt.getTime()).toBeGreaterThan(
      initial.createdAt.getTime(),
    );
    expect(Pusher.prototype.trigger).toHaveBeenCalledTimes(1);
  });

  it("bounds three conflicted writes to three battle reads and keeps the recovery message", async () => {
    const advance: Conflict = (current) => ({
      ...current,
      version: current.version + 1,
    });
    const harness = readyHarness(lobby(), [advance, advance, advance]);
    expect(await harness.call()).toEqual({
      success: false,
      message: "Someone else updated the battle state",
    });
    expect(harness.findFirst).toHaveBeenCalledTimes(3);
    expect(harness.writes.map((write) => write.version)).toEqual([1, 2, 3]);
    expect(harness.saved()?.usersState[0]!.iAmHere).toBe(false);
    expect(Pusher.prototype.trigger).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "membership",
      change: (current: CompleteBattle) => {
        current.usersState.shift();
      },
      result: { success: false, message: "You are not in this battle" },
    },
    {
      name: "lobby deadline",
      change: (current: CompleteBattle) => {
        current.roundStartAt = new Date(0);
      },
      result: { success: true, message: "" },
    },
    {
      name: "readiness",
      change: (current: CompleteBattle) => {
        current.usersState[0]!.iAmHere = true;
      },
      result: { success: true, message: "", battle: { version: 2 } },
    },
  ])(
    "rechecks $name before writing the conflict snapshot",
    async ({ change, result }) => {
      const harness = readyHarness(lobby(), [
        (current) => {
          current.version++;
          change(current);
          return current;
        },
      ]);
      expect(await harness.call()).toMatchObject(result);
      expect(harness.findFirst).toHaveBeenCalledTimes(2);
      expect(harness.writes).toHaveLength(1);
      expect(Pusher.prototype.trigger).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: "deleted battle", conflict: () => null },
    { name: "unchanged version", conflict: (current: CompleteBattle) => current },
  ])("does not retry a failed write with $name", async ({ conflict }) => {
    const harness = readyHarness(lobby(), [conflict]);
    expect(await harness.call()).toEqual({
      success: false,
      message: "Battle state could not be updated",
    });
    expect(harness.findFirst).toHaveBeenCalledTimes(2);
    expect(harness.writes).toHaveLength(1);
    expect(Pusher.prototype.trigger).not.toHaveBeenCalled();
  });

  it("keeps the initial missing-battle response", async () => {
    const harness = readyHarness(null);
    expect(await harness.call()).toEqual({
      success: false,
      message: "You are not in a battle",
    });
    expect(harness.findFirst).toHaveBeenCalledTimes(1);
    expect(harness.writes).toHaveLength(0);
    expect(Pusher.prototype.trigger).not.toHaveBeenCalled();
  });
});
