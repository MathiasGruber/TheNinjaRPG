// @vitest-environment node

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WAR_VICTORY_TOKEN_BONUS } from "@/drizzle/constants";
import { notification, village, war, warAlly } from "@/drizzle/schema";
import type { FetchActiveWarsReturnType } from "@/server/api/routers/war";
import type { DrizzleClient } from "@/server/db";
import { handleWarEnd } from "@/server/utils/war";
import {
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const snapshot = {
  id: "settlement-war",
  type: "VILLAGE_WAR",
  status: "ACTIVE",
  attackerVillageId: "attacker",
  defenderVillageId: "defender",
  attackerVillage: { id: "attacker", name: "Attacker", tokens: 100 },
  defenderVillage: { id: "defender", name: "Defender", tokens: 100 },
  attackerWarHealth: 100,
  defenderWarHealth: 0,
  warAllies: [],
} as unknown as FetchActiveWarsReturnType;

describe("war settlement claim", () => {
  it("waits for the claim and skips every effect when another caller settled", async () => {
    let resolveClaim!: (value: { rowsAffected: number }) => void;
    const pendingClaim = new Promise<{ rowsAffected: number }>((resolve) => {
      resolveClaim = resolve;
    });
    const saved = { status: "DEFENDER_VICTORY", endedAt: new Date() };
    const tx = {
      update: vi.fn(() => ({ set: () => ({ where: () => pendingClaim }) })),
      insert: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      query: { war: { findFirst: vi.fn().mockResolvedValue(saved) } },
    };
    const client = {
      transaction: async (run: (value: typeof tx) => unknown) => run(tx),
    };
    const result = handleWarEnd(snapshot, client as unknown as DrizzleClient);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.query.war.findFirst).not.toHaveBeenCalled();
    resolveClaim({ rowsAffected: 0 });
    expect(await result).toMatchObject(saved);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
  });
});

describeWithDatabase("atomic war settlement delivery", () => {
  beforeEach(async () => {
    await resetTables(notification, warAlly, war, village);
  });

  const seed = async () => {
    const database = await getTestDatabase();
    await database.insert(village).values(
      ["attacker", "defender", "winning-ally", "losing-ally"].map((id, i) => ({
        id,
        name: id,
        kageId: `${id}-kage`,
        sector: 101 + i,
        tokens: 100,
      })),
    );
    await database.insert(war).values({
      id: snapshot.id,
      attackerVillageId: "attacker",
      defenderVillageId: "defender",
      status: "ACTIVE",
      type: "VILLAGE_WAR",
      attackerWarHealth: 100,
      defenderWarHealth: 0,
    });
    await database.insert(warAlly).values([
      {
        id: "ally-a",
        warId: snapshot.id,
        villageId: "winning-ally",
        supportVillageId: "attacker",
        tokensPaid: 0,
      },
      {
        id: "ally-b",
        warId: snapshot.id,
        villageId: "losing-ally",
        supportVillageId: "defender",
        tokensPaid: 0,
      },
    ]);
    const activeWar = await database.query.war.findFirst({
      where: eq(war.id, snapshot.id),
      with: {
        attackerVillage: { with: { structures: true } },
        defenderVillage: { with: { structures: true } },
        warAllies: { with: { village: true } },
      },
    });
    if (!activeWar) throw new Error("Missing seeded war");
    return { database, activeWar };
  };

  const expectDeliveredOnce = async () => {
    const database = await getTestDatabase();
    const villages = await database.select().from(village);
    for (const row of villages) {
      const wins = ["attacker", "winning-ally"].includes(row.id);
      expect(row.tokens).toBe(100 + (wins ? WAR_VICTORY_TOKEN_BONUS / 2 : 0));
    }
    expect(await database.select().from(notification)).toHaveLength(1);
  };

  it("delivers once across concurrent callers and stale retries", async () => {
    const { database, activeWar } = await seed();
    const results = await Promise.all([
      handleWarEnd(activeWar, database),
      handleWarEnd(activeWar, database),
    ]);
    expect(results[0]?.endedAt).toEqual(results[1]?.endedAt);
    await handleWarEnd(activeWar, database);
    await expectDeliveredOnce();
  });

  it("rolls back delivered effects and the claim on late failure, then permits retry", async () => {
    const { database, activeWar } = await seed();
    const failure = new Error("Settlement commit failed");
    const failingClient = new Proxy(database, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return (async (run) =>
            target.transaction(async (tx) => {
              await run(tx);
              throw failure;
            })) as typeof database.transaction;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(handleWarEnd(activeWar, failingClient)).rejects.toThrow(failure);
    const saved = await database.query.war.findFirst({
      where: eq(war.id, snapshot.id),
    });
    expect(saved).toMatchObject({ status: "ACTIVE", endedAt: null });
    expect(await database.select().from(notification)).toHaveLength(0);
    for (const row of await database.select().from(village))
      expect(row.tokens).toBe(100);
    await handleWarEnd(activeWar, database);
    await expectDeliveredOnce();
  });
});
