import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as clerk from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import * as ids from "nanoid";
import {
  actionLog,
  bloodline,
  sanctionTombstone,
  userData,
  userReport,
  userReportComment,
  village,
} from "@/drizzle/schema";
import { profileRouter } from "@/routers/profile";
import { registerRouter } from "@/server/api/routers/register";
import { reportsRouter } from "@/server/api/routers/reports";
import { deleteUser } from "@/server/api/routers/staff";
import { removeAccountIdentity } from "@/server/utils/accountDeletion/identity";
import * as sanctions from "@/server/utils/sanctionTombstone";
import {
  hashSanctionIdentifier,
  normalizeEmail,
  removeExpiredSanctionTombstones,
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
const SANCTIONED = "user_sanctioned";

const identity = (
  email: string,
  accounts: SanctionIdentity["externalAccounts"] = [],
): SanctionIdentity => ({
  primaryEmailAddressId: "email_primary",
  emailAddresses: [
    { id: "email_primary", emailAddress: email, verification: { status: "verified" } },
  ],
  externalAccounts: accounts,
});

/** Answer Clerk lookups from this map; a missing id behaves like a deleted Clerk user. */
const stubClerk = (users: Record<string, SanctionIdentity>) => {
  const getUser = vi.fn(async (userId: string) => {
    const user = users[userId];
    if (!user) throw Object.assign(new Error("not found"), { status: 404 });
    return user;
  });
  vi.spyOn(clerk, "clerkClient").mockResolvedValue({
    users: {
      getUser,
      deleteUser: vi.fn(async () => {}),
      getUserOauthAccessToken: vi.fn(async () => ({ data: [] })),
    },
  } as never);
  return getUser;
};

const addSanction = async (
  userId: string,
  status: "BAN_ACTIVATED" | "SILENCE_ACTIVATED" | "TIMEOUT_ACTIVATED",
  banEnd: Date,
  id = `report-${status}`,
) => {
  const database = await getTestDatabase();
  await database.insert(userReport).values({
    id,
    reporterUserId: "reporter",
    reportedUserId: userId,
    system: "tavern_comment",
    infraction: { content: "offending message" },
    reason: "Spam",
    aiInterpretation: "",
    status,
    banEnd,
  });
};

const register = async (userId: string) =>
  registerRouter
    .createCaller({ drizzle: await getTestDatabase(), userId } as never)
    .createCharacter({
      username: `n${userId.slice(-11)}`.replace(/[^a-zA-Z0-9]/g, ""),
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
      bloodlineId: "tombstone-bloodline",
    });

const tombstonesOf = async (userId: string) =>
  (await getTestDatabase()).query.sanctionTombstone.findMany({
    where: eq(sanctionTombstone.userId, userId),
  });

describe("sanction identifier normalization", () => {
  it("folds Gmail aliases and preserves distinct local parts at other providers", () => {
    expect(normalizeEmail(" J.Doe+alt@GoogleMail.com ")).toBe("jdoe@gmail.com");
    expect(normalizeEmail("j.doe+x@example.com")).toBe("j.doe+x@example.com");
    expect(hashSanctionIdentifier("email", "a@b.c")).not.toBe(
      hashSanctionIdentifier("oauth", "a@b.c"),
    );
  });
});

describeWithDatabase("sanction tombstones", () => {
  beforeEach(async () => {
    await resetTables(
      actionLog,
      bloodline,
      sanctionTombstone,
      userData,
      userReport,
      userReportComment,
      village,
    );
    const database = await getTestDatabase();
    await Promise.all([
      database
        .insert(village)
        .values({
          id: "tombstone-horizon",
          name: "Horizon",
          sector: 1,
          kageId: "kage",
        }),
      database.insert(bloodline).values({
        id: "tombstone-bloodline",
        name: "tombstone bloodline",
        image: "/bloodline.png",
        description: "test",
        effects: [],
        rank: "D",
      }),
    ]);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    // Registration in other suites must not meet this suite's unexpired tombstones.
    await resetTables(sanctionTombstone);
  });

  it("records a running sanction with hashed identifiers only, before the reports go", async () => {
    const silenceEnd = new Date(Date.now() + 30 * DAY);
    await insertUsers([
      { userId: SANCTIONED, username: "Sanctioned", isSilenced: true },
    ]);
    await addSanction(SANCTIONED, "SILENCE_ACTIVATED", silenceEnd);
    await addSanction(SANCTIONED, "TIMEOUT_ACTIVATED", new Date(Date.now() + DAY));
    stubClerk({
      [SANCTIONED]: identity("Player+evade@Example.com", [
        { provider: "oauth_google", providerUserId: "google-123" },
      ]),
    });

    await deleteUser(await getTestDatabase(), SANCTIONED);

    const [tombstone, ...rest] = await tombstonesOf(SANCTIONED);
    expect(rest).toHaveLength(0);
    expect(tombstone).toMatchObject({
      sanction: "SILENCE",
      sanctionEndsAt: silenceEnd,
      emailHash: hashSanctionIdentifier("email", "player+evade@example.com"),
      accountHashes: [hashSanctionIdentifier("oauth", "google:google-123")],
    });
    expect([...(tombstone?.reportIds ?? [])].sort()).toEqual([
      "report-SILENCE_ACTIVATED",
      "report-TIMEOUT_ACTIVATED",
    ]);
    const stored = JSON.stringify(tombstone);
    expect(stored).not.toContain("Sanctioned");
    expect(stored).not.toContain("example.com");
    expect(stored).not.toContain("google-123");
    // The original reports are removed with the account, as before.
    expect(await (await getTestDatabase()).query.userReport.findMany()).toHaveLength(0);
  });

  it("records nothing and skips Clerk for an account without a running sanction", async () => {
    await insertUsers([{ userId: SANCTIONED }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() - DAY));
    const getUser = stubClerk({});

    await deleteUser(await getTestDatabase(), SANCTIONED);

    expect(await tombstonesOf(SANCTIONED)).toHaveLength(0);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("keeps hashes from the native identity step once the Clerk user is gone", async () => {
    await insertUsers([{ userId: SANCTIONED, isBanned: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() + 7 * DAY));
    const clerkUsers: Record<string, SanctionIdentity> = {
      [SANCTIONED]: identity("native@example.com"),
    };
    stubClerk(clerkUsers);

    await removeAccountIdentity(SANCTIONED);
    delete clerkUsers[SANCTIONED];
    await deleteUser(await getTestDatabase(), SANCTIONED);

    expect(await tombstonesOf(SANCTIONED)).toMatchObject([
      {
        sanction: "BAN",
        emailHash: hashSanctionIdentifier("email", "native@example.com"),
      },
    ]);
  });

  it("re-applies the remaining sanction to the same Clerk id after a web deletion", async () => {
    const banEnd = new Date(Date.now() + 10 * DAY);
    await insertUsers([{ userId: SANCTIONED, isBanned: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", banEnd, "original-ban");
    stubClerk({ [SANCTIONED]: identity("web@example.com") });
    await deleteUser(await getTestDatabase(), SANCTIONED);

    expect(await register(SANCTIONED)).toMatchObject({ success: true });

    const database = await getTestDatabase();
    const [user, reports, logs] = await Promise.all([
      database.query.userData.findFirst({ where: eq(userData.userId, SANCTIONED) }),
      database.query.userReport.findMany({
        where: eq(userReport.reportedUserId, SANCTIONED),
      }),
      database.query.actionLog.findMany({ where: eq(actionLog.userId, SANCTIONED) }),
    ]);
    expect(user).toMatchObject({ isBanned: true, isSilenced: false });
    expect(reports).toMatchObject([
      {
        status: "BAN_ACTIVATED",
        banEnd,
        system: "sanction_carryover",
        adminResolved: true,
      },
    ]);
    expect(reports[0]?.reason).not.toContain("original-ban");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      tableName: "userReport",
      relatedId: reports[0]?.id,
    });
    expect(logs[0]?.changes).toContain("Original reports: original-ban");
    expect(logs[0]?.changes).toContain("Matched by: clerkId, email");
  });

  it("matches a new Clerk id by a differently spelled email after a native deletion", async () => {
    const silenceEnd = new Date(Date.now() + 3 * DAY);
    await getTestDatabase().then((database) =>
      database.insert(sanctionTombstone).values({
        userId: "user_deleted",
        sanction: "SILENCE",
        sanctionEndsAt: silenceEnd,
        reportIds: ["original-silence"],
        emailHash: hashSanctionIdentifier("email", "returner@gmail.com"),
        accountHashes: [],
      }),
    );
    stubClerk({ user_returning: identity("R.e.t.u.r.n.e.r+2@GoogleMail.com") });

    expect(await register("user_returning")).toMatchObject({ success: true });

    const database = await getTestDatabase();
    expect(
      await database.query.userData.findFirst({
        where: eq(userData.userId, "user_returning"),
        columns: { isBanned: true, isSilenced: true },
      }),
    ).toEqual({ isBanned: false, isSilenced: true });
    expect(
      await database.query.userReport.findFirst({
        where: and(
          eq(userReport.reportedUserId, "user_returning"),
          eq(userReport.status, "SILENCE_ACTIVATED"),
        ),
      }),
    ).toMatchObject({ banEnd: silenceEnd });
    const [log] = await database.query.actionLog.findMany({
      where: eq(actionLog.userId, "user_returning"),
    });
    expect(log?.changes).toContain("Matched by: email");
  });

  it("ignores an expired tombstone and the cleaner removes it", async () => {
    const database = await getTestDatabase();
    await database.insert(sanctionTombstone).values({
      userId: SANCTIONED,
      sanction: "BAN",
      sanctionEndsAt: new Date(Date.now() - 1000),
      reportIds: ["expired-ban"],
      emailHash: null,
      accountHashes: [],
    });
    const getUser = stubClerk({});

    expect(await register(SANCTIONED)).toMatchObject({ success: true });

    expect(getUser).not.toHaveBeenCalled();
    expect(
      (
        await database.query.userData.findFirst({
          where: eq(userData.userId, SANCTIONED),
        })
      )?.isBanned,
    ).toBe(false);
    expect(await database.query.userReport.findMany()).toHaveLength(0);
    await removeExpiredSanctionTombstones(database);
    expect(await tombstonesOf(SANCTIONED)).toHaveLength(0);
  });

  it("lets a silenced player delete through the web flow", async () => {
    await insertUsers([{ userId: SANCTIONED, isSilenced: true }]);
    await addSanction(SANCTIONED, "SILENCE_ACTIVATED", new Date(Date.now() + DAY));
    stubClerk({ [SANCTIONED]: identity("silenced@example.com") });
    const caller = await callerFor(profileRouter, SANCTIONED);

    expect(await caller.toggleDeletionTimer({ userId: SANCTIONED })).toMatchObject({
      success: true,
    });
    const database = await getTestDatabase();
    await database
      .update(userData)
      .set({ deletionAt: new Date(Date.now() - 1000) })
      .where(eq(userData.userId, SANCTIONED));
    expect(await caller.confirmDeletion({ userId: SANCTIONED })).toMatchObject({
      success: true,
    });

    expect(
      await database.query.userData.findFirst({
        where: eq(userData.userId, SANCTIONED),
      }),
    ).toBeUndefined();
    expect(await tombstonesOf(SANCTIONED)).toMatchObject([{ sanction: "SILENCE" }]);
  });

  it("does not retain an unverified primary email or sanction its verified owner", async () => {
    await insertUsers([{ userId: SANCTIONED, isBanned: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() + DAY));
    const unverified = identity("another-owner@example.com");
    unverified.emailAddresses[0]!.verification = { status: "unverified" };
    stubClerk({
      [SANCTIONED]: unverified,
      user_owner: identity("another-owner@example.com"),
    });

    await deleteUser(await getTestDatabase(), SANCTIONED);
    expect(await tombstonesOf(SANCTIONED)).toMatchObject([{ emailHash: null }]);
    expect(await register("user_owner")).toMatchObject({ success: true });
    expect(
      (
        await (
          await getTestDatabase()
        ).query.userData.findFirst({
          where: eq(userData.userId, "user_owner"),
        })
      )?.isBanned,
    ).toBe(false);
  });

  it("matches linked OAuth identities after an email change", async () => {
    await insertUsers([{ userId: SANCTIONED, isBanned: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() + DAY));
    stubClerk({
      [SANCTIONED]: identity("old@example.com", [
        { provider: "oauth_google", providerUserId: "same-subject" },
      ]),
      user_oauth: identity("new@example.com", [
        { provider: "google", providerUserId: "same-subject" },
      ]),
    });
    await deleteUser(await getTestDatabase(), SANCTIONED);

    expect(await register("user_oauth")).toMatchObject({ success: true });
    expect(
      (
        await (
          await getTestDatabase()
        ).query.userData.findFirst({
          where: eq(userData.userId, "user_oauth"),
        })
      )?.isBanned,
    ).toBe(true);
  });

  it("keeps a sanctioned character invisible until its reports are durable", async () => {
    await insertUsers([{ userId: SANCTIONED, isBanned: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() + DAY));
    stubClerk({ [SANCTIONED]: identity("atomic@example.com") });
    const database = await getTestDatabase();
    await deleteUser(database, SANCTIONED);
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reapply = sanctions.reapplySanctions;
    vi.spyOn(sanctions, "reapplySanctions").mockImplementation((...args) => {
      enter();
      return [...reapply(...args), paused] as never;
    });
    const registration = register(SANCTIONED);
    await entered;
    try {
      expect(
        await database.query.userData.findFirst({
          where: eq(userData.userId, SANCTIONED),
        }),
      ).toBeUndefined();
    } finally {
      release();
      await registration;
    }
    expect(await (await callerFor(reportsRouter, SANCTIONED)).getBan()).toMatchObject({
      status: "BAN_ACTIVATED",
    });
  });

  it("rolls back the character if a carryover report cannot be saved", async () => {
    await insertUsers([{ userId: SANCTIONED, isBanned: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() + DAY));
    stubClerk({ [SANCTIONED]: identity("rollback@example.com") });
    const database = await getTestDatabase();
    await deleteUser(database, SANCTIONED);
    await addSanction(
      "another-user",
      "BAN_ACTIVATED",
      new Date(Date.now() + DAY),
      "conflicting-id",
    );
    vi.spyOn(ids, "nanoid").mockReturnValue("conflicting-id");

    await expect(register(SANCTIONED)).rejects.toThrow();
    expect(
      await database.query.userData.findFirst({
        where: eq(userData.userId, SANCTIONED),
      }),
    ).toBeUndefined();
    expect(await tombstonesOf(SANCTIONED)).toMatchObject([{ carryoverReportIds: [] }]);
    expect(await database.query.userReportComment.findMany()).toHaveLength(0);
  });

  it("does not resurrect a carryover sanction after staff clear it and the player deletes again", async () => {
    await insertUsers([{ userId: SANCTIONED, isBanned: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() + DAY));
    stubClerk({
      [SANCTIONED]: identity("cleared@example.com"),
      user_cleared: identity("cleared@example.com"),
    });
    const database = await getTestDatabase();
    await deleteUser(database, SANCTIONED);
    await register("user_cleared");
    await insertUsers([{ userId: "staff", role: "OWNER" }]);
    const report = await database.query.userReport.findFirst({
      where: eq(userReport.reportedUserId, "user_cleared"),
    });

    expect(
      await (await callerFor(reportsRouter, "staff")).clear({
        object_id: report!.id,
        comment: "Sanction lifted",
        banTime: 1,
        banTimeUnit: "days",
      }),
    ).toMatchObject({ success: true });
    expect(await tombstonesOf(SANCTIONED)).toHaveLength(0);
    await deleteUser(database, "user_cleared");
    expect(await register("user_cleared")).toMatchObject({ success: true });
    expect(
      (
        await database.query.userData.findFirst({
          where: eq(userData.userId, "user_cleared"),
        })
      )?.isBanned,
    ).toBe(false);
  });

  it("retains other active sanctions when staff clear a carryover ban", async () => {
    await insertUsers([{ userId: SANCTIONED, isBanned: true, isSilenced: true }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", new Date(Date.now() + DAY));
    await addSanction(SANCTIONED, "SILENCE_ACTIVATED", new Date(Date.now() + DAY));
    stubClerk({
      [SANCTIONED]: identity("multiple@example.com"),
      user_multiple: identity("multiple@example.com"),
    });
    const database = await getTestDatabase();
    await deleteUser(database, SANCTIONED);
    await register("user_multiple");
    await insertUsers([{ userId: "staff", role: "OWNER" }]);
    await addSanction(
      "user_multiple",
      "BAN_ACTIVATED",
      new Date(Date.now() + 2 * DAY),
      "another-ban",
    );
    const report = await database.query.userReport.findFirst({
      where: and(
        eq(userReport.reportedUserId, "user_multiple"),
        eq(userReport.status, "BAN_ACTIVATED"),
        eq(userReport.system, "sanction_carryover"),
      ),
    });

    expect(
      await (await callerFor(reportsRouter, "staff")).clear({
        object_id: report!.id,
        comment: "Lift inherited ban only",
        banTime: 1,
        banTimeUnit: "days",
      }),
    ).toMatchObject({ success: true });
    expect(await tombstonesOf(SANCTIONED)).toMatchObject([{ sanction: "SILENCE" }]);
    expect(
      await database.query.userData.findFirst({
        where: eq(userData.userId, "user_multiple"),
      }),
    ).toMatchObject({ isBanned: true, isSilenced: true });
    expect(
      await database.query.userReport.findFirst({
        where: eq(userReport.id, "another-ban"),
      }),
    ).toMatchObject({ status: "BAN_ACTIVATED" });
  });
});
