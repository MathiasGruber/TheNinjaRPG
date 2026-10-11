import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import { eq, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import mysql from "mysql2/promise";
import {
  WAR_DEFEAT_STRUCTURE_PENALTY_LEVELS,
  WAR_PURCHASE_SHRINE_TOKEN_COST,
  WAR_SECTOR_LOSS_TOWNHALL_DAMAGE,
  WAR_VICTORY_BOOSTED_STRUCTURES,
  WAR_VICTORY_STRUCTURE_BOOST_LEVELS,
  WAR_VICTORY_TOKEN_BONUS,
  WAR_WINNING_BOOST_REGEN_PERC,
  WAR_WINNING_BOOST_TRAINING_PERC,
  type WarType,
} from "@/drizzle/constants";
import {
  gameSetting,
  mpvpBattleQueue,
  mpvpBattleUser,
  notification,
  questHistory,
  sector,
  userData,
  userRequest,
  village,
  villageStructure,
  war,
  warAlly,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { shrineRouter } from "@/server/api/routers/shrine";
import {
  fetchActiveWar,
  fetchActiveWars,
  fetchEndedWars,
  warRouter,
} from "@/server/api/routers/war";
import type { DrizzleClient } from "@/server/db";
import { handleWarEnd } from "@/server/utils/war";
import { acceptWarAllyOffer, withdrawWarAlly } from "@/server/utils/warAlly";
import { insertUsers } from "../../setup/factories";
import { resetServerModuleStubs, stubProfile } from "../../setup/serverModules";
import {
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  recordQueries,
  resetTables,
  runRawSql,
} from "../../setup/testDatabase";

const warId = "settlement-war";
const sectorId = 205;
const tokens = WAR_PURCHASE_SHRINE_TOKEN_COST * 3;
const dialect = new MySqlDialect();
const statement = (query: SQL) => dialect.sqlToQuery(query).sql;
const intercept = (
  db: DrizzleClient,
  run: (
    query: SQL,
    execute: () => ReturnType<DrizzleClient["execute"]>,
  ) => ReturnType<DrizzleClient["execute"]>,
) =>
  new Proxy(db, {
    get(target, property, receiver) {
      if (property === "execute")
        return (query: SQL) => run(query, () => target.execute(query));
      if (property === "transaction")
        return () => {
          throw new Error("Settlement must not open a transaction");
        };
      return Reflect.get(target, property, receiver);
    },
  });
const seed = async (type: WarType = "VILLAGE_WAR") => {
  const db = await getTestDatabase();
  await db.insert(village).values(
    ["attacker", "defender", "ally", "other"].map((id, i) => ({
      id,
      name: id,
      sector: 101 + i,
      kageId: `${id}-kage`,
      tokens,
    })),
  );
  await db.insert(war).values({
    id: warId,
    type,
    status: "ACTIVE",
    sector: sectorId,
    attackerVillageId: "attacker",
    defenderVillageId: "defender",
    attackerWarHealth: 100,
    defenderWarHealth: type === "SECTOR_WAR" ? 100 : 0,
    defenderShrineHp: 0,
  });
  await db.insert(sector).values({ sector: sectorId, villageId: "defender" });
  await insertUsers([
    { userId: "attacker-user", villageId: "attacker" },
    { userId: "defender-user", villageId: "defender" },
  ]);
  await db.insert(gameSetting).values(
    ["war-attacker-regen", "war-ally-regen", "war-attacker-train"].map((name) => ({
      id: name,
      name,
      value: 0,
      time: new Date(0),
    })),
  );
  await db.insert(villageStructure).values(
    ["attacker", "defender"].flatMap((id) =>
      ["/townhall", ...WAR_VICTORY_BOOSTED_STRUCTURES]
        .filter((route, index, all) => all.indexOf(route) === index)
        .map((route) => ({
          id: `${id}${route}`,
          name: route,
          route,
          image: "",
          villageId: id,
          curSp: WAR_SECTOR_LOSS_TOWNHALL_DAMAGE * 2,
        })),
    ),
  );
  return db;
};
const snapshot = async (db: DrizzleClient) => {
  const value = await fetchActiveWar(db, warId);
  if (!value) throw new Error("Missing seeded war");
  return value;
};
const savedWar = (db: DrizzleClient) =>
  db.query.war.findFirst({ where: eq(war.id, warId) });
const balance = async (db: DrizzleClient, id: string) =>
  (await db.query.village.findFirst({ where: eq(village.id, id) }))?.tokens;
const addAlly = (db: DrizzleClient) =>
  db.insert(warAlly).values({
    id: "ally-membership",
    warId,
    villageId: "ally",
    supportVillageId: "attacker",
    tokensPaid: 0,
  });
const offer = {
  offerId: "offer",
  warId,
  villageId: "ally",
  supportVillageId: "attacker",
  userId: "ally-kage",
};
const addOffer = (db: DrizzleClient, value = 100) =>
  db.insert(userRequest).values({
    id: offer.offerId,
    type: "WAR_ALLY",
    status: "PENDING",
    senderId: "attacker-kage",
    receiverId: offer.userId,
    relatedId: warId,
    value,
  });

describeWithDatabase("guarded war settlement and delivery", () => {
  beforeEach(async () => {
    await resetTables(
      notification,
      gameSetting,
      mpvpBattleUser,
      mpvpBattleQueue,
      questHistory,
      sector,
      userData,
      userRequest,
      villageStructure,
      warAlly,
      war,
      village,
    );
  });
  afterEach(resetServerModuleStubs);

  it("withdrawal overlapping settlement either leaves before rewards or loses its claim", async () => {
    const db = await seed();
    await addAlly(db);
    const initial = await snapshot(db);
    const [settled, withdrawn] = await Promise.all([
      handleWarEnd(initial, db),
      withdrawWarAlly(db, warId, "ally", "ally-kage"),
    ]);
    expect(settled.status).toBe("ATTACKER_VICTORY");
    expect(await balance(db, "ally")).toBe(
      tokens + (withdrawn.success ? 0 : WAR_VICTORY_TOKEN_BONUS / 2),
    );
    expect((await savedWar(db))?.settlement?.winningVillageIds.includes("ally")).toBe(
      !withdrawn.success,
    );
  });

  it("acceptance overlapping settlement cannot deliver a late membership or partial payment", async () => {
    const db = await seed();
    await addOffer(db);
    const initial = await snapshot(db);
    const [settled, admitted] = await Promise.all([
      handleWarEnd(initial, db),
      acceptWarAllyOffer(db, offer),
    ]);
    expect(settled.status).toBe("ATTACKER_VICTORY");
    const receipt = (await savedWar(db))?.settlement;
    expect(receipt?.winningVillageIds.includes("ally")).toBe(admitted.success);
    expect(await balance(db, "ally")).toBe(
      tokens + (admitted.success ? 100 + WAR_VICTORY_TOKEN_BONUS / 2 : 0),
    );
  });

  it("the uniqueness migration retains one active legacy membership and preserves history", async () => {
    const db = await seed();
    await runRawSql("ALTER TABLE WarAlly DROP INDEX WarAlly_active_village_key");
    try {
      await addAlly(db);
      await db.insert(warAlly).values({
        id: "duplicate-membership",
        warId,
        villageId: "ally",
        supportVillageId: "attacker",
        tokensPaid: 0,
      });
      const migration = readFileSync(
        new URL("../../../drizzle/migrations/0072_powerful_lake.sql", import.meta.url),
        "utf8",
      );
      const deduplicate = migration.match(/UPDATE `WarAlly`[\s\S]+?;/)?.[0];
      if (!deduplicate) throw new Error("Missing membership migration");
      await runRawSql(deduplicate);
      expect(await db.select().from(warAlly)).toHaveLength(2);
      expect((await snapshot(db)).warAllies).toHaveLength(1);
    } finally {
      await runRawSql(
        "ALTER TABLE WarAlly ADD CONSTRAINT WarAlly_active_village_key UNIQUE(warId, activeVillageId)",
      );
    }
  });

  it("pays the winning side once across concurrent claims and stale retries, without transactions", async () => {
    const db = await seed();
    await addAlly(db);
    await db.insert(warAlly).values({
      id: "losing-membership",
      warId,
      villageId: "other",
      supportVillageId: "defender",
      tokensPaid: 0,
    });
    const initial = await snapshot(db);
    const client = intercept(db, (_query, execute) => execute());
    const recorded = await recordQueries(() =>
      Promise.all([handleWarEnd(initial, client), handleWarEnd(initial, client)]),
    );
    expect(recorded.result.every((row) => row.status === "ATTACKER_VICTORY")).toBe(
      true,
    );
    await handleWarEnd(initial, client);
    expect(await balance(db, "attacker")).toBe(tokens + WAR_VICTORY_TOKEN_BONUS / 2);
    expect(await balance(db, "ally")).toBe(tokens + WAR_VICTORY_TOKEN_BONUS / 2);
    expect(await balance(db, "defender")).toBe(tokens);
    expect(await balance(db, "other")).toBe(tokens);
    expect(await db.select().from(notification)).toHaveLength(1);
    expect(
      (await db.select().from(userData)).every(
        (user) => user.unreadNotifications === 1,
      ),
    ).toBe(true);
    expect(await savedWar(db)).toMatchObject({
      settlementPending: false,
      settlement: { boostsDelivered: true, structuresDelivered: true, notified: true },
    });
    expect(
      recorded.statements.some((query) => /^(begin|start transaction)/i.test(query)),
    ).toBe(false);
    const settings = await db.select().from(gameSetting);
    expect(settings.find((row) => row.name === "war-ally-regen")?.value).toBe(
      WAR_WINNING_BOOST_REGEN_PERC,
    );
    expect(settings.find((row) => row.name === "war-attacker-train")?.value).toBe(
      WAR_WINNING_BOOST_TRAINING_PERC,
    );
  });

  it("rolls back every balance and the claim if the core SQL update fails", async () => {
    const db = await seed();
    await addAlly(db);
    await db
      .update(village)
      .set({ tokens: 2_147_483_647 })
      .where(eq(village.id, "ally"));
    const initial = await snapshot(db);
    await expect(handleWarEnd(initial, db)).rejects.toThrow();
    expect(await savedWar(db)).toMatchObject({
      status: "ACTIVE",
      endedAt: null,
      settlement: null,
    });
    expect(await balance(db, "attacker")).toBe(tokens);
    expect(await db.select().from(notification)).toHaveLength(0);
    await db.update(village).set({ tokens }).where(eq(village.id, "ally"));
    await handleWarEnd(initial, db);
    expect(await balance(db, "attacker")).toBe(tokens + WAR_VICTORY_TOKEN_BONUS / 2);
  });

  it("resumes failed cleanup through active-war reads without paying or notifying twice", async () => {
    const db = await seed();
    const client = intercept(db, async (query, execute) => {
      if (statement(query).includes("DELETE qh"))
        throw new Error("Quest cleanup unavailable");
      return execute();
    });
    expect((await handleWarEnd(await snapshot(db), client)).status).toBe(
      "ATTACKER_VICTORY",
    );
    expect(await savedWar(db)).toMatchObject({ settlementPending: true });
    expect(await fetchActiveWars(db, "attacker")).toHaveLength(0);
    expect(await savedWar(db)).toMatchObject({ settlementPending: false });
    expect(await balance(db, "attacker")).toBe(tokens + WAR_VICTORY_TOKEN_BONUS);
    expect(await db.select().from(notification)).toHaveLength(1);
    expect(
      (await db.select().from(userData)).every(
        (user) => user.unreadNotifications === 1,
      ),
    ).toBe(true);
  });

  it("excludes a withdrawn ally when the supplied roster is stale", async () => {
    const db = await seed();
    await addAlly(db);
    const initial = await snapshot(db);
    expect((await withdrawWarAlly(db, warId, "ally", "ally-kage")).success).toBe(true);
    await handleWarEnd(initial, db);
    expect(await balance(db, "ally")).toBe(tokens);
    expect(await balance(db, "attacker")).toBe(tokens + WAR_VICTORY_TOKEN_BONUS);
    expect(
      (
        await db.query.gameSetting.findFirst({
          where: eq(gameSetting.name, "war-ally-regen"),
        })
      )?.value,
    ).toBe(0);
    expect((await savedWar(db))?.settlement?.winningVillageIds).toEqual(["attacker"]);
    expect((await db.select().from(warAlly))[0]?.endedAt).not.toBeNull();
    expect(await fetchEndedWars(db, "ally")).toHaveLength(0);
  });

  it("includes an ally accepted after the supplied roster was read", async () => {
    const db = await seed();
    const initial = await snapshot(db);
    await addOffer(db);
    expect((await acceptWarAllyOffer(db, offer)).success).toBe(true);
    await handleWarEnd(initial, db);
    expect(await balance(db, "attacker")).toBe(
      tokens - 100 + WAR_VICTORY_TOKEN_BONUS / 2,
    );
    expect(await balance(db, "ally")).toBe(tokens + 100 + WAR_VICTORY_TOKEN_BONUS / 2);
  });

  it("conserves the complete reward pool when the recipient count does not divide it", async () => {
    const db = await seed();
    for (let i = 0; i < 6; i++) {
      await db.insert(village).values({
        id: `recipient-${i}`,
        name: `recipient-${i}`,
        sector: 110 + i,
        kageId: `recipient-${i}-kage`,
        tokens,
      });
      await db.insert(warAlly).values({
        id: `membership-${i}`,
        warId,
        villageId: `recipient-${i}`,
        supportVillageId: "attacker",
        tokensPaid: 0,
      });
    }
    await handleWarEnd(await snapshot(db), db);
    expect(
      (await db.select().from(village)).reduce(
        (sum, row) => sum + row.tokens - tokens,
        0,
      ),
    ).toBe(WAR_VICTORY_TOKEN_BONUS);
    expect(await balance(db, "attacker")).toBe(
      tokens + Math.floor(WAR_VICTORY_TOKEN_BONUS / 7) + (WAR_VICTORY_TOKEN_BONUS % 7),
    );
  });

  it("a draw pays no rewards and penalizes both villages", async () => {
    const db = await seed();
    await db.update(war).set({ attackerWarHealth: 0 }).where(eq(war.id, warId));
    expect((await handleWarEnd(await snapshot(db), db)).status).toBe("DRAW");
    expect(
      (await db.select().from(village)).every((row) => row.tokens === tokens),
    ).toBe(true);
    expect(
      (await db.select().from(villageStructure)).every(
        (row) => row.temporaryLevelBonus === -WAR_DEFEAT_STRUCTURE_PENALTY_LEVELS,
      ),
    ).toBe(true);
  });

  it("a raid limits the losing penalty to its target and preserves all winner boosts", async () => {
    const db = await seed("WAR_RAID");
    await handleWarEnd(await snapshot(db), db);
    const structures = await db.select().from(villageStructure);
    expect(
      structures
        .filter(
          (row) =>
            row.villageId === "attacker" &&
            WAR_VICTORY_BOOSTED_STRUCTURES.includes(row.route as never),
        )
        .every((row) => row.temporaryLevelBonus === WAR_VICTORY_STRUCTURE_BOOST_LEVELS),
    ).toBe(true);
    expect(
      structures.find((row) => row.id === "defender/townhall")?.temporaryLevelBonus,
    ).toBe(-WAR_DEFEAT_STRUCTURE_PENALTY_LEVELS);
    expect(
      structures
        .filter((row) => row.villageId === "defender" && row.route !== "/townhall")
        .every((row) => row.temporaryLevelBonus === 0),
    ).toBe(true);
  });

  it("closing sibling sector wars clears participation after all their outcomes commit", async () => {
    const db = await seed("SECTOR_WAR");
    await db.insert(war).values({
      id: "other-war",
      type: "SECTOR_WAR",
      status: "ACTIVE",
      sector: sectorId,
      attackerVillageId: "other",
      defenderVillageId: "defender",
    });
    await db.update(userData).set({
      warParticipantUntil: new Date(Date.now() + 86_400_000),
      status: "QUEUED",
    });
    await db.insert(mpvpBattleQueue).values({
      id: "queue",
      battleType: "SHRINE_BATTLE",
      sector: sectorId,
      attackerEntityId: "attacker",
      defenderEntityId: "defender",
    });
    await db.insert(mpvpBattleUser).values({
      id: "queued-user",
      clanBattleId: "queue",
      userId: "attacker-user",
      side: "ATTACKER",
      slot: 0,
    });
    await handleWarEnd(await snapshot(db), db, { shrineBuilderId: "attacker-kage" });
    expect((await db.select().from(war)).every((row) => row.status !== "ACTIVE")).toBe(
      true,
    );
    expect(
      (await db.select().from(userData)).every(
        (user) => user.warParticipantUntil.getTime() === 0,
      ),
    ).toBe(true);
    expect(
      (
        await db.query.userData.findFirst({
          where: eq(userData.userId, "attacker-user"),
        })
      )?.status,
    ).toBe("AWAKE");
    expect(await db.select().from(mpvpBattleQueue)).toHaveLength(0);
    expect(await db.select().from(mpvpBattleUser)).toHaveLength(0);
    expect((await db.query.sector.findFirst())?.villageId).toBe("attacker");
    expect(
      (
        await db.query.villageStructure.findFirst({
          where: eq(villageStructure.id, "defender/townhall"),
        })
      )?.curSp,
    ).toBe(WAR_SECTOR_LOSS_TOWNHALL_DAMAGE);
  });

  it("retains participation in an unrelated active war", async () => {
    const db = await seed();
    const until = new Date(Date.now() + 86_400_000);
    await db.update(userData).set({ warParticipantUntil: until });
    await db.insert(war).values({
      id: "other-war",
      type: "SECTOR_WAR",
      status: "ACTIVE",
      sector: 206,
      attackerVillageId: "attacker",
      defenderVillageId: "other",
    });
    await handleWarEnd(await snapshot(db), db);
    expect(
      (
        await db.query.userData.findFirst({
          where: eq(userData.userId, "attacker-user"),
        })
      )?.warParticipantUntil,
    ).toEqual(until);
    expect(
      (
        await db.query.userData.findFirst({
          where: eq(userData.userId, "defender-user"),
        })
      )?.warParticipantUntil.getTime(),
    ).toBe(0);
  });

  it("a failed shrine claim leaves tokens intact; overlapping requests charge once", async () => {
    const db = await seed("SECTOR_WAR");
    stubProfile("fetchUpdatedUser", async () => ({
      user: {
        userId: "attacker-kage",
        villageId: "attacker",
        village: await db.query.village.findFirst({
          where: eq(village.id, "attacker"),
        }),
      },
      requiresUserRefresh: false,
    }));
    const fail = intercept(db, async (query, execute) => {
      if (statement(query).trimStart().startsWith("UPDATE `War`"))
        throw new Error("Claim unavailable");
      return execute();
    });
    await expect(
      callerForDatabase(warRouter, "attacker-kage", fail).buildShrine({ warId }),
    ).rejects.toThrow("Claim unavailable");
    expect(await balance(db, "attacker")).toBe(tokens);
    expect(await savedWar(db)).toMatchObject({ status: "ACTIVE", endedAt: null });
    const caller = callerForDatabase(warRouter, "attacker-kage", db);
    const results = await Promise.all([
      caller.buildShrine({ warId }),
      caller.buildShrine({ warId }),
    ]);
    expect(results.some((row) => row.success)).toBe(true);
    expect(await balance(db, "attacker")).toBe(tokens - WAR_PURCHASE_SHRINE_TOKEN_COST);
    expect(await db.select().from(notification)).toHaveLength(1);
  });

  it("acceptance creates one membership and moves a payment once under concurrent retries", async () => {
    const db = await seed();
    await addOffer(db);
    expect(
      (
        await Promise.all([
          acceptWarAllyOffer(db, offer),
          acceptWarAllyOffer(db, offer),
        ])
      ).every((row) => row.success),
    ).toBe(true);
    expect(await db.select().from(warAlly)).toHaveLength(1);
    expect(await balance(db, "attacker")).toBe(tokens - 100);
    expect(await balance(db, "ally")).toBe(tokens + 100);
    expect((await db.query.userRequest.findFirst())?.status).toBe("ACCEPTED");
  });

  it("an interrupted payment leaves a hidden receipt that retry can deliver", async () => {
    const db = await seed();
    await addOffer(db);
    const client = intercept(db, async (query, execute) => {
      if (statement(query).includes("UPDATE UserRequest r"))
        throw new Error("Payment unavailable");
      return execute();
    });
    await expect(acceptWarAllyOffer(client, offer)).rejects.toThrow(
      "Payment unavailable",
    );
    expect((await snapshot(db)).warAllies).toHaveLength(0);
    expect(await balance(db, "ally")).toBe(tokens);
    expect((await acceptWarAllyOffer(db, offer)).success).toBe(true);
    expect((await snapshot(db)).warAllies).toHaveLength(1);
    expect(await balance(db, "ally")).toBe(tokens + 100);
  });

  it("insufficient funds and an ended war reject admission without moving tokens", async () => {
    const db = await seed();
    await addOffer(db, tokens + 1);
    expect((await acceptWarAllyOffer(db, offer)).success).toBe(false);
    expect(await db.select().from(warAlly)).toHaveLength(0);
    expect(await balance(db, "ally")).toBe(tokens);
    await db.update(userRequest).set({ value: 100 });
    await handleWarEnd(await snapshot(db), db);
    expect((await acceptWarAllyOffer(db, offer)).success).toBe(false);
    expect(await balance(db, "ally")).toBe(tokens);
  });

  it("keeps a successful claim retryable when its receipt cannot be reloaded", async () => {
    const db = await seed();
    const initial = await snapshot(db);
    const read = spyOn(db.query.war, "findFirst").mockRejectedValueOnce(
      new Error("Receipt read unavailable"),
    );
    try {
      const ended = await handleWarEnd(initial, db);
      expect(ended.status).toBe("ATTACKER_VICTORY");
      expect(ended.settlementPending).toBe(true);
    } finally {
      read.mockRestore();
    }
    expect((await savedWar(db))?.settlementPending).toBe(true);
    await fetchActiveWars(db);
    expect((await savedWar(db))?.settlementPending).toBe(false);
    expect(await balance(db, "attacker")).toBe(tokens + WAR_VICTORY_TOKEN_BONUS);
    expect(await db.select().from(notification)).toHaveLength(1);
  });

  for (const waitForLock of [false, true])
    it(`cleans preclaim shrine queues and quests ${waitForLock ? "while the terminal update waits on a row lock" : "before the terminal update"}`, async () => {
      const db = await seed("SECTOR_WAR");
      stubProfile("fetchUpdatedUser", async () => ({
        user: await db.query.userData.findFirst({
          where: eq(userData.userId, "attacker-user"),
          with: { village: true },
        }),
        requiresUserRefresh: false,
      }));
      const trigger = spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
      const connection = waitForLock
        ? await mysql.createConnection(process.env.TEST_MYSQL_URL!)
        : undefined;
      if (connection) {
        await connection.beginTransaction();
        await connection.query("SELECT id FROM War WHERE id = ? FOR UPDATE", [warId]);
      }
      let admittedAt: Date | undefined;
      const client = intercept(db, async (query, execute) => {
        if (!admittedAt && statement(query).trimStart().startsWith("UPDATE `War`")) {
          const pending = connection ? execute() : undefined;
          await new Promise((resolve) => setTimeout(resolve, 50));
          expect((await savedWar(db))?.status).toBe("ACTIVE");
          expect(
            (
              await callerForDatabase(
                shrineRouter,
                "attacker-user",
                db,
              ).challengeShrine({
                sectorNumber: sectorId,
              })
            ).success,
          ).toBe(true);
          admittedAt = (await db.query.mpvpBattleQueue.findFirst())?.createdAt;
          await db.insert(questHistory).values({
            id: "preclaim-quest",
            userId: "attacker-user",
            questId: "war-quest",
            questType: "war",
            startedAt: admittedAt,
          });
          await connection?.commit();
          if (pending) return pending;
        }
        return execute();
      });
      try {
        const ended = await handleWarEnd(await snapshot(db), client, {
          shrineBuilderId: "attacker-kage",
        });
        expect(ended.status).toBe("ATTACKER_VICTORY");
        expect((await savedWar(db))?.settlementPending).toBe(false);
        expect(await db.select().from(mpvpBattleQueue)).toHaveLength(0);
        expect(await db.select().from(mpvpBattleUser)).toHaveLength(0);
        expect(await db.select().from(questHistory)).toHaveLength(0);
        expect(
          (
            await db.query.userData.findFirst({
              where: eq(userData.userId, "attacker-user"),
            })
          )?.status,
        ).toBe("AWAKE");
        expect(ended.settlement?.cleanupCutoff).toBeGreaterThanOrEqual(
          admittedAt?.getTime() ?? 0,
        );
        expect((await savedWar(db))?.endedAt).toEqual(ended.endedAt);
        expect((await db.query.sector.findFirst())?.capturedAt).toEqual(ended.endedAt);
      } finally {
        trigger.mockRestore();
        await connection?.rollback();
        await connection?.end();
      }
    });

  it("delayed delivery preserves quests and shrine queues created after the settlement", async () => {
    const db = await seed();
    const client = intercept(db, async (query, execute) => {
      if (statement(query).includes("DELETE qh"))
        throw new Error("Cleanup unavailable");
      return execute();
    });
    const ended = await handleWarEnd(await snapshot(db), client);
    if (!ended.settlement?.cleanupCutoff) throw new Error("Missing cleanup cutoff");
    const cutoff = ended.settlement.cleanupCutoff;
    const later = new Date(cutoff + 60_000);
    await db.insert(questHistory).values([
      {
        id: "old-quest",
        userId: "attacker-user",
        questId: "old",
        questType: "war",
        startedAt: new Date(0),
      },
      {
        id: "new-quest",
        userId: "attacker-user",
        questId: "new",
        questType: "war",
        startedAt: later,
      },
    ]);
    await db.insert(mpvpBattleQueue).values({
      id: "new-queue",
      battleType: "SHRINE_BATTLE",
      attackerEntityId: "attacker",
      defenderEntityId: "defender",
      createdAt: later,
    });
    await db.insert(mpvpBattleUser).values({
      id: "new-user",
      userId: "attacker-user",
      clanBattleId: "new-queue",
      side: "ATTACKER",
      slot: 0,
    });
    await db
      .update(userData)
      .set({ status: "QUEUED" })
      .where(eq(userData.userId, "attacker-user"));
    await fetchActiveWars(db);
    expect((await savedWar(db))?.settlement?.cleanupCutoff).toBe(cutoff);
    expect((await db.select().from(questHistory)).map((row) => row.id)).toEqual([
      "new-quest",
    ]);
    expect(await db.select().from(mpvpBattleQueue)).toHaveLength(1);
    expect(await db.select().from(mpvpBattleUser)).toHaveLength(1);
    expect(
      (
        await db.query.userData.findFirst({
          where: eq(userData.userId, "attacker-user"),
        })
      )?.status,
    ).toBe("QUEUED");
  });
});
