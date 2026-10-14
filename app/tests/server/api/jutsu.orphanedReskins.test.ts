import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import {
  actionLog,
  contentProposal,
  contentProposalBasis,
  jutsu,
  jutsuReskin,
  userData,
  userJutsu,
} from "@/drizzle/schema";
import { jutsuRouter } from "@/server/api/routers/jutsu";
import { insertUsers } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

/**
 * Player-owned jutsu reskins reference their base jutsu by id. Staff cannot delete a
 * jutsu while player reskins point at it, reskins whose base jutsu is gone do not use
 * up reskin slots, and the staff reskin list keeps showing them so they can be
 * re-pointed.
 */
const STAFF = "staff-user";
const OWNER = "owner-user";

const caller = (userId: string) => callerFor(jutsuRouter, userId);

const stubRateLimitTransport = () => {
  const realFetch = globalThis.fetch;
  // Keep the public-procedure rate limiter active without requiring Redis.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) {
      return realFetch(input, init);
    }
    const commands = JSON.parse(init.body) as unknown[];
    const resultFor = (command: unknown[]) => ({
      result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1,
    });
    return Response.json(
      Array.isArray(commands[0])
        ? commands.map((command) => resultFor(command as unknown[]))
        : resultFor(commands),
    );
  });
};

const jutsuRow = (id: string) => ({
  id,
  name: `Jutsu ${id}`,
  description: id,
  battleDescription: id,
  effects: [],
  target: "SELF" as const,
  range: 0,
  requiredRank: "GENIN" as const,
  jutsuType: "NORMAL" as const,
  image: `/${id}.png`,
});

const reskinRow = (id: string, jutsuId: string) => ({
  id,
  userId: OWNER,
  jutsuId,
  name: `Reskin ${id}`,
  description: id,
  battleDescription: id,
  image: `/${id}.png`,
});

describeWithDatabase("orphaned jutsu reskins against a real MySQL", () => {
  beforeEach(async () => {
    stubRateLimitTransport();
    await resetTables(
      contentProposalBasis,
      contentProposal,
      actionLog,
      jutsuReskin,
      userJutsu,
      jutsu,
      userData,
    );
    await insertUsers([
      { userId: STAFF, username: "Staff", role: "CONTENT" },
      { userId: OWNER, username: "Owner", extraReskinSlots: 0, reputationPoints: 500 },
    ] as never);
    const database = await getTestDatabase();
    await database
      .insert(jutsu)
      .values([jutsuRow("jutsu-a"), jutsuRow("jutsu-b"), jutsuRow("jutsu-c")]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("delete", () => {
    it("lists player reskins as relations and refuses to delete their jutsu", async () => {
      const database = await getTestDatabase();
      await database.insert(jutsuReskin).values(reskinRow("reskin-a", "jutsu-a"));
      const relations = await (await caller(STAFF)).getJutsuRelations({
        jutsuId: "jutsu-a",
      });
      expect(relations.playerReskins).toEqual([
        { id: "reskin-a", name: "Reskin reskin-a (Owner)" },
      ]);
      const result = await (await caller(STAFF)).delete({ id: "jutsu-a" });
      expect(result.success).toBe(false);
      expect(result.message).toContain("Player reskin: Reskin reskin-a (Owner)");
      const rows = await database.select().from(jutsu).where(eq(jutsu.id, "jutsu-a"));
      expect(rows.length).toBe(1);
    });

    it("deletes the jutsu once its player reskins are re-pointed", async () => {
      const database = await getTestDatabase();
      await database.insert(jutsuReskin).values(reskinRow("reskin-a", "jutsu-b"));
      const result = await (await caller(STAFF)).delete({ id: "jutsu-a" });
      expect(result.success).toBe(true);
    });
  });

  describe("createReskin", () => {
    it("does not count reskins of deleted jutsu toward the slot limit", async () => {
      const database = await getTestDatabase();
      await database
        .insert(jutsuReskin)
        .values([reskinRow("orphan-1", "deleted-1"), reskinRow("orphan-2", "deleted-2")]);
      await database
        .insert(userJutsu)
        .values({ id: "uj-owner-a", userId: OWNER, jutsuId: "jutsu-a" });
      const result = await (await caller(OWNER)).createReskin({
        jutsuId: "jutsu-a",
        name: "New reskin",
        description: "New reskin description",
        battleDescription: "New reskin battle text",
      });
      expect(result).toMatchObject({ success: true });
    });

    it("still enforces the slot limit for reskins of existing jutsu", async () => {
      const database = await getTestDatabase();
      await database
        .insert(jutsuReskin)
        .values([reskinRow("live-1", "jutsu-b"), reskinRow("live-2", "jutsu-c")]);
      await database
        .insert(userJutsu)
        .values({ id: "uj-owner-a", userId: OWNER, jutsuId: "jutsu-a" });
      const result = await (await caller(OWNER)).createReskin({
        jutsuId: "jutsu-a",
        name: "New reskin",
        description: "New reskin description",
        battleDescription: "New reskin battle text",
      });
      expect(result).toMatchObject({ success: false });
      expect(result.message).toContain("You have used all your reskins (2/2)");
    });
  });

  describe("getAllReskins", () => {
    it("lists reskins of deleted jutsu first, without base jutsu data", async () => {
      const database = await getTestDatabase();
      await database
        .insert(jutsuReskin)
        .values([reskinRow("live-1", "jutsu-a"), reskinRow("orphan-1", "deleted-1")]);
      const result = await (await caller(STAFF)).getAllReskins({
        limit: 10,
        hideAi: true,
      });
      expect(result.data.map((reskin) => [reskin.id, reskin.jutsu?.id ?? null])).toEqual(
        [
          ["orphan-1", null],
          ["live-1", "jutsu-a"],
        ],
      );
    });

    it("keeps reskins of deleted jutsu visible when filtering by base jutsu", async () => {
      const database = await getTestDatabase();
      await database
        .insert(jutsuReskin)
        .values([
          reskinRow("live-a", "jutsu-a"),
          reskinRow("live-b", "jutsu-b"),
          reskinRow("orphan-1", "deleted-1"),
        ]);
      const result = await (await caller(STAFF)).getAllReskins({
        limit: 10,
        name: "jutsu-b",
      });
      expect(result.data.map((reskin) => reskin.id).sort()).toEqual([
        "live-b",
        "orphan-1",
      ]);
    });
  });
});
