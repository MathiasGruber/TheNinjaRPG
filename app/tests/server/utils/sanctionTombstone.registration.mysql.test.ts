import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import * as clerk from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import {
  accountDeletion,
  actionLog,
  bloodline,
  bloodlineRolls,
  questHistory,
  sanctionTombstone,
  storeUserIdAlias,
  userAttribute,
  userData,
  userReport,
  userReportComment,
  type UserReportComment,
  village,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { registerRouter } from "@/server/api/routers/register";
import { reportsRouter } from "@/server/api/routers/reports";
import { processAccountDeletions } from "@/server/utils/accountDeletion/process";
import { DELETED_STORE_USER_PREFIX } from "@/server/utils/purchases/grant";
import {
  hashSanctionIdentifier,
  type SanctionIdentity,
} from "@/server/utils/sanctionTombstone";
import { insertUsers } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const DAY = 86_400_000;
const EMAIL = "registration-appeal@example.com";
const identity = (email: string): SanctionIdentity => ({
  primaryEmailAddressId: "primary",
  emailAddresses: [
    { id: "primary", emailAddress: email, verification: { status: "verified" } },
  ],
  externalAccounts: [],
});
let owners: Map<string, SanctionIdentity>;
let gatedId: string | undefined;
let enterLookup: (() => void) | undefined;
let lookupGate: Promise<void> | undefined;

const claimIdentity = (userId: string, email = EMAIL) => {
  expect(
    [...owners.values()].some((owner) =>
      owner.emailAddresses.some((address) => address.emailAddress === email),
    ),
  ).toBe(false);
  owners.set(userId, identity(email));
};

const register = async (userId: string) =>
  (await callerFor(registerRouter, userId)).createCharacter({
    username: userId,
    gender: "Male",
    hair_color: "Black",
    eye_color: "Blue",
    skin_color: "Light",
    attribute_1: "Soft features",
    attribute_2: "Glasses",
    attribute_3: "Short Hair",
    read_tos: true,
    read_privacy: true,
    read_earlyaccess: true,
    utm_source: null,
    bloodlineId: "registration-bloodline",
  });

const reportsOf = async (userId: string) =>
  (await getTestDatabase()).query.userReport.findMany({
    where: eq(userReport.reportedUserId, userId),
  });

const deleteAccount = async (userId: string) => {
  const database = await getTestDatabase();
  await database.insert(accountDeletion).values({ userId });
  expect(await processAccountDeletions(userId)).toEqual({ processed: 1, failed: 0 });
  expect(owners.has(userId)).toBe(false);
  await database
    .update(accountDeletion)
    .set({ nextAttemptAt: new Date(Date.now() - 1) })
    .where(eq(accountDeletion.userId, userId));
  expect(await processAccountDeletions(userId)).toEqual({ processed: 1, failed: 0 });
  expect(
    await database.query.accountDeletion.findFirst({
      where: eq(accountDeletion.userId, userId),
    }),
  ).toMatchObject({ phase: "COMPLETE" });
  expect(
    await database.query.userData.findFirst({ where: eq(userData.userId, userId) }),
  ).toBeUndefined();
  expect(await reportsOf(userId)).toHaveLength(0);
};

const startRegistration = async () => {
  claimIdentity("Concurrent");
  gatedId = "Concurrent";
  const entered = new Promise<void>((resolve) => {
    enterLookup = resolve;
  });
  let release!: () => void;
  lookupGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = register("Concurrent");
  await entered;
  expect(
    await (await getTestDatabase()).query.userData.findFirst({
      where: eq(userData.userId, "Concurrent"),
    }),
  ).toBeUndefined();
  expect(await reportsOf("Concurrent")).toHaveLength(0);
  return { pending, release };
};

const expectRolledBack = async (existingComments: UserReportComment[] = []) => {
  const database = await getTestDatabase();
  expect(
    await database.query.userData.findFirst({
      where: eq(userData.userId, "Concurrent"),
    }),
  ).toBeUndefined();
  expect(await reportsOf("Concurrent")).toHaveLength(0);
  expect(await database.query.userReportComment.findMany()).toEqual(existingComments);
  for (const table of [actionLog, userAttribute, bloodlineRolls, questHistory]) {
    expect(
      await database.select().from(table).where(eq(table.userId, "Concurrent")),
    ).toHaveLength(0);
  }
};

describeWithDatabase("registration claims current sanction sources", () => {
  beforeEach(async () => {
    await resetTables(
      accountDeletion,
      actionLog,
      bloodline,
      bloodlineRolls,
      questHistory,
      sanctionTombstone,
      storeUserIdAlias,
      userAttribute,
      userData,
      userReport,
      userReportComment,
      village,
    );
    owners = new Map();
    claimIdentity("Original");
    gatedId = undefined;
    enterLookup = undefined;
    lookupGate = undefined;
    vi.spyOn(clerk, "clerkClient").mockResolvedValue({
      users: {
        getUser: vi.fn(async (userId: string) => {
          if (userId === gatedId) {
            enterLookup?.();
            await lookupGate;
          }
          const owner = owners.get(userId);
          if (!owner) throw Object.assign(new Error("not found"), { status: 404 });
          return owner;
        }),
        deleteUser: vi.fn(async (userId: string) => {
          owners.delete(userId);
        }),
      },
    } as never);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue();
    const database = await getTestDatabase();
    await Promise.all([
      insertUsers([{ userId: "staff", role: "OWNER" }, { userId: "Original" }]),
      database.insert(village).values({
        id: "registration-horizon",
        name: "Horizon",
        sector: 1,
        kageId: "kage",
      }),
      database.insert(bloodline).values({
        id: "registration-bloodline",
        name: "Test bloodline",
        image: "/bloodline.png",
        description: "test",
        effects: [],
        rank: "D",
      }),
      database.insert(userReport).values({
        id: "original-case",
        reporterUserId: "staff",
        reportedUserId: "Original",
        system: "tavern_comment",
        infraction: {},
        reason: "Spam",
        aiInterpretation: "",
        status: "BAN_ACTIVATED",
        banEnd: new Date(Date.now() + 10 * DAY),
      }),
    ]);
    await deleteAccount("Original");
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["clear", "silence", "ban", "unchanged"] as const)(
    "honors a completed %s decision during Clerk lookup, including later native recreation",
    async (decision) => {
      const database = await getTestDatabase();
      claimIdentity("Replacement");
      expect(await register("Replacement")).toMatchObject({ success: true });
      const inherited = (await reportsOf("Replacement"))[0]!;
      owners.set("Replacement", identity("changed-appeal@example.com"));
      // A retry must retain the store ledger's deletion marker until a character exists.
      const alias = {
        oldUserId: "Concurrent",
        newUserId: `${DELETED_STORE_USER_PREFIX}Concurrent`,
      };
      await database.insert(storeUserIdAlias).values(alias);
      const { pending, release } = await startRegistration();
      let saved = await database.query.sanctionTombstone.findMany();
      let savedComments = await database.query.userReportComment.findMany();
      try {
        if (decision !== "unchanged") {
          expect(
            await (await callerFor(reportsRouter, "staff"))[decision]({
              object_id: inherited.id,
              comment: "Appeal accepted",
              banTime: 1,
              banTimeUnit: "days",
            }),
          ).toMatchObject({ success: true });
        }
        saved = await database.query.sanctionTombstone.findMany();
        savedComments = await database.query.userReportComment.findMany();
      } finally {
        release();
      }
      const result = await pending;
      if (decision !== "unchanged") {
        expect(result).toEqual({
          success: false,
          message: "Account sanctions changed, please try again",
        });
        await expectRolledBack(savedComments);
        expect(await database.query.sanctionTombstone.findMany()).toEqual(saved);
        expect(
          await database.query.storeUserIdAlias.findFirst({
            where: eq(storeUserIdAlias.oldUserId, "Concurrent"),
          }),
        ).toMatchObject(alias);
        expect(await register("Concurrent")).toMatchObject({ success: true });
      } else expect(result).toMatchObject({ success: true });
      const expected =
        decision === "clear"
          ? []
          : [
              expect.objectContaining({
                status: decision === "silence" ? "SILENCE_ACTIVATED" : "BAN_ACTIVATED",
                banEnd: saved[0]!.sanctionEndsAt,
              }),
            ];
      expect(await reportsOf("Concurrent")).toEqual(expected);
      expect(
        await database.query.storeUserIdAlias.findFirst({
          where: eq(storeUserIdAlias.oldUserId, "Concurrent"),
        }),
      ).toBeUndefined();
      await deleteAccount("Concurrent");
      claimIdentity("LaterReturn");
      expect(await register("LaterReturn")).toMatchObject({ success: true });
      expect(await reportsOf("LaterReturn")).toEqual(expected);
      const active = await (await callerFor(reportsRouter, "LaterReturn")).getBan();
      expect(active?.status === "BAN_ACTIVATED").toBe(
        decision === "ban" || decision === "unchanged",
      );
    },
  );

  it.each(["matched", "ancestor", "other-type"] as const)(
    "rolls back every report and link when one %s source changes",
    async (changed) => {
      const database = await getTestDatabase();
      const source = (await database.query.sanctionTombstone.findFirst())!;
      await database.insert(sanctionTombstone).values([
        {
          ...source,
          userId: "second-source",
          sourceId: "second-case",
          sanctionEndsAt: new Date(Date.now() + 3 * DAY),
        },
        {
          ...source,
          userId: "ancestor-source",
          sourceId: "ancestor-case",
          emailHash: hashSanctionIdentifier("email", "ancestor@example.com"),
          carryoverReportIds: ["original-case"],
        },
        {
          ...source,
          userId: "silence-source",
          sourceId: "silence-case",
          sanction: "SILENCE",
        },
      ]);
      const changedId =
        changed === "matched"
          ? "second-case"
          : changed === "ancestor"
            ? "ancestor-case"
            : "silence-case";
      const { pending, release } = await startRegistration();
      try {
        await database
          .delete(sanctionTombstone)
          .where(eq(sanctionTombstone.sourceId, changedId));
      } finally {
        release();
      }
      expect(await pending).toMatchObject({ success: false });
      await expectRolledBack();
      const saved = await database.query.sanctionTombstone.findMany();
      expect(saved).toHaveLength(3);
      expect(
        saved.every(
          (row) =>
            row.carryoverReportIds.length ===
            (row.sourceId === "ancestor-case" ? 1 : 0),
        ),
      ).toBe(true);
      expect(await register("Concurrent")).toMatchObject({ success: true });
      const reports = await reportsOf("Concurrent");
      expect(reports).toHaveLength(changed === "other-type" ? 1 : 2);
      expect(
        reports.find((report) => report.status === "BAN_ACTIVATED")!.banEnd,
      ).toEqual(source.sanctionEndsAt);
    },
  );

  it.each(["email", "oauth", "expired", "links"] as const)(
    "validates %s changes without rejecting another registration's appended link",
    async (change) => {
      const database = await getTestDatabase();
      const { pending, release } = await startRegistration();
      try {
        await database
          .update(sanctionTombstone)
          .set(
            change === "email"
              ? { emailHash: hashSanctionIdentifier("email", "different@example.com") }
              : change === "oauth"
                ? { accountHashes: ["changed-oauth-hash"] }
                : change === "expired"
                  ? { sanctionEndsAt: new Date(Date.now() - 1) }
                  : {
                      carryoverReportIds: sql`JSON_ARRAY_APPEND(${sanctionTombstone.carryoverReportIds}, '$', 'other-registration')`,
                    },
          );
      } finally {
        release();
      }
      expect(await pending).toMatchObject({ success: change === "links" });
      if (change === "links") {
        expect(
          (await database.query.sanctionTombstone.findFirst())!.carryoverReportIds,
        ).toEqual(["other-registration", (await reportsOf("Concurrent"))[0]!.id]);
      } else {
        await expectRolledBack();
        expect(
          (await database.query.sanctionTombstone.findFirst())!.carryoverReportIds,
        ).toEqual([]);
        expect(await register("Concurrent")).toMatchObject({ success: true });
        expect(await reportsOf("Concurrent")).toHaveLength(change === "oauth" ? 1 : 0);
      }
    },
  );
});
