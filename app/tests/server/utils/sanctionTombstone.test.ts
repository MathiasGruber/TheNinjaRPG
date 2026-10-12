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
import { Pusher } from "@/libs/pusher";
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

    const tombstones = await tombstonesOf(SANCTIONED);
    expect(tombstones).toHaveLength(2);
    for (const tombstone of tombstones) {
      expect(tombstone).toMatchObject({
        sanction: "SILENCE",
        emailHash: hashSanctionIdentifier("email", "player+evade@example.com"),
        accountHashes: [hashSanctionIdentifier("oauth", "google:google-123")],
      });
    }
    expect(
      tombstones.find((source) => source.sourceId === "report-SILENCE_ACTIVATED"),
    ).toMatchObject({ sanctionEndsAt: silenceEnd });
    expect(tombstones.map((source) => source.sourceId).sort()).toEqual([
      "report-SILENCE_ACTIVATED",
      "report-TIMEOUT_ACTIVATED",
    ]);
    const stored = JSON.stringify(tombstones);
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

  it.each([
    ["clear", false],
    ["silence", false],
    ["ban", false],
    ["unchanged", false],
    ["clear", true],
    ["silence", true],
    ["ban", true],
    ["unchanged", true],
  ] as const)(
    "captures a completed %s decision during Clerk lookup with independent cases: %p",
    async (decision, hasIndependentCases) => {
      const database = await getTestDatabase();
      const originalEnd = new Date(Date.now() + 10 * DAY);
      const shorterEnd = new Date(Date.now() + 3 * DAY);
      const silenceEnd = new Date(Date.now() + 20 * DAY);
      await insertUsers([{ userId: SANCTIONED }, { userId: "staff", role: "OWNER" }]);
      await addSanction(SANCTIONED, "BAN_ACTIVATED", originalEnd, "original-case");
      if (hasIndependentCases) {
        await addSanction(SANCTIONED, "BAN_ACTIVATED", shorterEnd, "shorter-case");
        await addSanction(SANCTIONED, "SILENCE_ACTIVATED", silenceEnd, "silence-case");
      }
      const clerkIdentity = identity("capture@example.com", [
        { provider: "oauth_google", providerUserId: "capture-subject" },
      ]);
      const getUser = stubClerk({ [SANCTIONED]: clerkIdentity });
      let enter!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      getUser.mockImplementationOnce(async () => {
        enter();
        await gate;
        return clerkIdentity;
      });
      vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue();
      const deleting = deleteUser(database, SANCTIONED);
      await entered;
      let revisedEnd = originalEnd;
      try {
        expect(await tombstonesOf(SANCTIONED)).toHaveLength(0);
        if (decision !== "unchanged") {
          expect(
            await (await callerFor(reportsRouter, "staff"))[decision]({
              object_id: "original-case",
              comment: "Appeal accepted",
              banTime: 1,
              banTimeUnit: "days",
            }),
          ).toMatchObject({ success: true });
        }
        const revised = await database.query.userReport.findFirst({
          where: eq(userReport.id, "original-case"),
        });
        revisedEnd = revised!.banEnd!;
      } finally {
        release();
      }
      await deleting;
      expect(
        await database.query.userData.findFirst({
          where: eq(userData.userId, SANCTIONED),
        }),
      ).toBeUndefined();
      expect(await database.query.userReport.findMany()).toHaveLength(0);
      const sources = await tombstonesOf(SANCTIONED);
      expect(sources).toHaveLength(
        (decision === "clear" ? 0 : 1) + (hasIndependentCases ? 2 : 0),
      );
      const original = sources.find((source) => source.sourceId === "original-case");
      if (decision === "clear") expect(original).toBeUndefined();
      else
        expect(original).toMatchObject({
          sanction: decision === "silence" ? "SILENCE" : "BAN",
          sanctionEndsAt: revisedEnd,
        });
      for (const source of sources) {
        expect(source).toMatchObject({
          emailHash: hashSanctionIdentifier("email", "capture@example.com"),
          accountHashes: [hashSanctionIdentifier("oauth", "google:capture-subject")],
          carryoverReportIds: [],
        });
      }
      if (hasIndependentCases)
        expect(sources).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceId: "shorter-case",
              sanction: "BAN",
              sanctionEndsAt: shorterEnd,
            }),
            expect.objectContaining({
              sourceId: "silence-case",
              sanction: "SILENCE",
              sanctionEndsAt: silenceEnd,
            }),
          ]),
        );
      expect(await register(SANCTIONED)).toMatchObject({ success: true });
      const reports = await database.query.userReport.findMany({
        where: eq(userReport.reportedUserId, SANCTIONED),
      });
      const banEnd =
        hasIndependentCases && decision !== "unchanged"
          ? shorterEnd
          : decision === "ban" || decision === "unchanged"
            ? revisedEnd
            : null;
      const expectedSilenceEnd = hasIndependentCases
        ? silenceEnd
        : decision === "silence"
          ? revisedEnd
          : null;
      const expected = [
        ...(banEnd ? [{ status: "BAN_ACTIVATED", banEnd }] : []),
        ...(expectedSilenceEnd
          ? [{ status: "SILENCE_ACTIVATED", banEnd: expectedSilenceEnd }]
          : []),
      ];
      expect(reports).toHaveLength(expected.length);
      expect(reports).toEqual(
        expect.arrayContaining(
          expected.map((report) => expect.objectContaining(report)),
        ),
      );
      expect(
        await database.query.userData.findFirst({
          columns: { isBanned: true, isSilenced: true },
          where: eq(userData.userId, SANCTIONED),
        }),
      ).toEqual({ isBanned: !!banEnd, isSilenced: !!expectedSilenceEnd });
    },
  );

  it("refreshes a captured decision without replacing its carryover links or creation time", async () => {
    const database = await getTestDatabase();
    await insertUsers([{ userId: SANCTIONED }, { userId: "staff", role: "OWNER" }]);
    await addSanction(
      SANCTIONED,
      "BAN_ACTIVATED",
      new Date(Date.now() + 10 * DAY),
      "original-case",
    );
    const capturedIdentity = identity("capture@example.com");
    stubClerk({ [SANCTIONED]: capturedIdentity });
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue();
    await sanctions.recordSanctionTombstone(database, SANCTIONED);
    await database.update(sanctionTombstone).set({
      carryoverReportIds: ["inherited-case"],
    });
    const before = (await tombstonesOf(SANCTIONED))[0]!;
    expect(
      await (await callerFor(reportsRouter, "staff")).silence({
        object_id: "original-case",
        comment: "Appeal accepted",
        banTime: 1,
        banTimeUnit: "days",
      }),
    ).toMatchObject({ success: true });
    const revised = await database.query.userReport.findFirst({
      where: eq(userReport.id, "original-case"),
    });
    // A cleanup retry may still find the original report and must preserve existing links.
    await sanctions.recordSanctionTombstone(database, SANCTIONED, capturedIdentity);
    await deleteUser(database, SANCTIONED);
    expect(await tombstonesOf(SANCTIONED)).toEqual([
      {
        ...before,
        sanction: "SILENCE",
        sanctionEndsAt: revised!.banEnd!,
      },
    ]);
    await sanctions.recordSanctionTombstone(database, SANCTIONED);
    expect(await tombstonesOf(SANCTIONED)).toEqual([
      {
        ...before,
        sanction: "SILENCE",
        sanctionEndsAt: revised!.banEnd!,
      },
    ]);
  });

  it("revises every source across repeated web deletions and an identity change", async () => {
    const database = await getTestDatabase();
    await insertUsers([{ userId: SANCTIONED }, { userId: "staff", role: "OWNER" }]);
    await addSanction(
      SANCTIONED,
      "BAN_ACTIVATED",
      new Date(Date.now() + 10 * DAY),
      "first-ban",
    );
    await addSanction(
      SANCTIONED,
      "BAN_ACTIVATED",
      new Date(Date.now() + 3 * DAY),
      "second-ban",
    );
    await addSanction(
      SANCTIONED,
      "SILENCE_ACTIVATED",
      new Date(Date.now() + 20 * DAY),
      "separate-silence",
    );
    const clerkUsers = { [SANCTIONED]: identity("first-web@example.com") };
    stubClerk(clerkUsers);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue();
    await deleteUser(database, SANCTIONED);
    expect(await register(SANCTIONED)).toMatchObject({ success: true });
    const inherited = await database.query.userReport.findMany({
      where: eq(userReport.reportedUserId, SANCTIONED),
    });
    expect(inherited).toHaveLength(2);
    const grouped = inherited.find((report) => report.status === "BAN_ACTIVATED")!;
    const separate = inherited.find((report) => report.status === "SILENCE_ACTIVATED")!;
    const staff = await callerFor(reportsRouter, "staff");
    const input = {
      comment: "Revise inherited cases",
      banTime: 1,
      banTimeUnit: "days" as const,
    };
    expect(await staff.silence({ ...input, object_id: grouped.id })).toMatchObject({
      success: true,
    });
    expect(await staff.clear({ ...input, object_id: separate.id })).toMatchObject({
      success: true,
    });
    const revised = await database.query.userReport.findFirst({
      where: eq(userReport.id, grouped.id),
    });
    const originalSources = await tombstonesOf(SANCTIONED);
    expect(originalSources).toHaveLength(2);
    expect(
      originalSources.every(
        (source) =>
          source.sanction === "SILENCE" &&
          source.sanctionEndsAt.getTime() === revised!.banEnd!.getTime(),
      ),
    ).toBe(true);
    clerkUsers[SANCTIONED] = identity("changed-web@example.com");
    await deleteUser(database, SANCTIONED);
    expect(await tombstonesOf(SANCTIONED)).toEqual(
      expect.arrayContaining(originalSources),
    );
    expect(await tombstonesOf(SANCTIONED)).toHaveLength(3);
    expect(await register(SANCTIONED)).toMatchObject({ success: true });
    const returned = await database.query.userReport.findMany({
      where: eq(userReport.reportedUserId, SANCTIONED),
    });
    expect(returned).toMatchObject([
      { status: "SILENCE_ACTIVATED", banEnd: revised!.banEnd },
    ]);
    expect(
      await database.query.actionLog.findFirst({
        where: eq(actionLog.relatedId, returned[0]!.id),
      }),
    ).toMatchObject({
      changes: expect.arrayContaining([
        expect.stringContaining("first-ban"),
        expect.stringContaining("second-ban"),
      ]),
    });
    expect(await staff.clear({ ...input, object_id: returned[0]!.id })).toMatchObject({
      success: true,
    });
    expect(await tombstonesOf(SANCTIONED)).toHaveLength(0);
    await deleteUser(database, SANCTIONED);
    expect(await register(SANCTIONED)).toMatchObject({ success: true });
    expect(
      await database.query.userReport.findMany({
        where: eq(userReport.reportedUserId, SANCTIONED),
      }),
    ).toHaveLength(0);
  });

  it("matches a new Clerk id by a differently spelled email after a native deletion", async () => {
    const silenceEnd = new Date(Date.now() + 3 * DAY);
    await getTestDatabase().then((database) =>
      database.insert(sanctionTombstone).values({
        userId: "user_deleted",
        sourceId: "original-silence",
        sanction: "SILENCE",
        sanctionEndsAt: silenceEnd,
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
      sourceId: "expired-ban",
      sanction: "BAN",
      sanctionEndsAt: new Date(Date.now() - 1000),
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

  it.each([
    ["BAN_ACTIVATED", "warn"],
    ["SILENCE_ACTIVATED", "warn"],
    ["BAN_ACTIVATED", "tradeBan"],
    ["SILENCE_ACTIVATED", "tradeBan"],
  ] as const)(
    "does not restore a carryover %s replaced by staff %s after another deletion",
    async (status, decision) => {
      const database = await getTestDatabase();
      await insertUsers([{ userId: SANCTIONED }]);
      await addSanction(SANCTIONED, status, new Date(Date.now() + DAY));
      stubClerk({
        [SANCTIONED]: identity("replaced@example.com"),
        user_replaced: identity("replaced@example.com"),
      });
      vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue();
      await deleteUser(database, SANCTIONED);
      expect(await register("user_replaced")).toMatchObject({ success: true });
      await deleteUser(database, "user_replaced");
      expect(await register("user_replaced")).toMatchObject({ success: true });
      expect(await database.query.sanctionTombstone.findMany()).toHaveLength(2);
      const report = await database.query.userReport.findFirst({
        where: eq(userReport.reportedUserId, "user_replaced"),
      });
      expect(report).toMatchObject({ status, system: "sanction_carryover" });
      await insertUsers([{ userId: "staff", role: "OWNER" }]);

      expect(
        await (await callerFor(reportsRouter, "staff"))[decision]({
          object_id: report!.id,
          comment: "Replace the inherited sanction",
          banTime: 1,
          banTimeUnit: "days",
        }),
      ).toMatchObject({ success: true });
      expect(
        await database.query.userReport.findFirst({
          where: eq(userReport.id, report!.id),
        }),
      ).toMatchObject({
        status: decision === "warn" ? "OFFICIAL_WARNING" : "TRADE_BAN_ACTIVATED",
      });
      expect(await database.query.sanctionTombstone.findMany()).toHaveLength(0);
      await (await callerFor(reportsRouter, "user_replaced")).getBan();
      await deleteUser(database, "user_replaced");
      expect(await register("user_replaced")).toMatchObject({ success: true });
      expect(
        await database.query.userData.findFirst({
          where: eq(userData.userId, "user_replaced"),
        }),
      ).toMatchObject({ isBanned: false, isSilenced: false });
    },
  );

  it.each(["warn", "tradeBan"] as const)(
    "retains an independent ban when staff %s replaces a silence revised into a ban",
    async (decision) => {
      const database = await getTestDatabase();
      const independentEnd = new Date(Date.now() + 20 * DAY);
      await insertUsers([{ userId: SANCTIONED }]);
      await addSanction(
        SANCTIONED,
        "SILENCE_ACTIVATED",
        new Date(Date.now() + 10 * DAY),
        "original-silence",
      );
      await addSanction(SANCTIONED, "BAN_ACTIVATED", independentEnd, "original-ban");
      stubClerk({
        [SANCTIONED]: identity("independent@example.com"),
        user_revised: identity("independent@example.com"),
      });
      vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue();
      await deleteUser(database, SANCTIONED);
      expect(await register("user_revised")).toMatchObject({ success: true });
      await insertUsers([{ userId: "staff", role: "OWNER" }]);
      const staff = await callerFor(reportsRouter, "staff");
      const report = await database.query.userReport.findFirst({
        where: and(
          eq(userReport.reportedUserId, "user_revised"),
          eq(userReport.status, "SILENCE_ACTIVATED"),
        ),
      });
      const input = {
        object_id: report!.id,
        comment: "Revise the inherited sanction",
        banTime: 1,
        banTimeUnit: "days" as const,
      };
      expect(await staff.ban(input)).toMatchObject({ success: true });
      expect(await staff[decision](input)).toMatchObject({ success: true });
      expect(await tombstonesOf(SANCTIONED)).toMatchObject([
        {
          sourceId: "original-ban",
          sanction: "BAN",
          sanctionEndsAt: independentEnd,
        },
      ]);
      await deleteUser(database, "user_revised");
      expect(await register("user_revised")).toMatchObject({ success: true });
      expect(
        await database.query.userReport.findMany({
          where: eq(userReport.reportedUserId, "user_revised"),
        }),
      ).toMatchObject([{ status: "BAN_ACTIVATED", banEnd: independentEnd }]);
      expect(
        await database.query.userData.findFirst({
          where: eq(userData.userId, "user_revised"),
        }),
      ).toMatchObject({ isBanned: true, isSilenced: false });
    },
  );

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

  it.each(["ban", "silence"] as const)(
    "preserves a staff-revised %s through the deleted identity and another deletion",
    async (decision) => {
      const database = await getTestDatabase();
      const status = decision === "ban" ? "BAN_ACTIVATED" : "SILENCE_ACTIVATED";
      const sanction = decision === "ban" ? "BAN" : "SILENCE";
      const originalEnd = new Date(Date.now() + 10 * DAY);
      await insertUsers([{ userId: SANCTIONED }]);
      await addSanction(SANCTIONED, status, originalEnd, "original-sanction");
      const clerkUsers: Record<string, SanctionIdentity> = {
        [SANCTIONED]: identity("appeal@example.com"),
        user_appealed: identity("appeal@example.com"),
        user_old_email: identity("appeal@example.com"),
      };
      stubClerk(clerkUsers);
      await removeAccountIdentity(SANCTIONED);
      delete clerkUsers[SANCTIONED];
      await deleteUser(database, SANCTIONED);
      expect(await register("user_appealed")).toMatchObject({ success: true });
      clerkUsers.user_appealed = identity("changed@example.com");
      await insertUsers([{ userId: "staff", role: "OWNER" }]);
      const report = await database.query.userReport.findFirst({
        where: eq(userReport.reportedUserId, "user_appealed"),
      });
      const staff = await callerFor(reportsRouter, "staff");
      const input = { object_id: report!.id, comment: "Reduce sanction after appeal" };
      expect(
        await staff[decision]({ ...input, banTime: 1, banTimeUnit: "days" }),
      ).toMatchObject({ success: true });
      const revised = await database.query.userReport.findFirst({
        where: eq(userReport.id, report!.id),
      });
      expect(revised!.banEnd!.getTime()).toBeLessThan(originalEnd.getTime());
      expect(await tombstonesOf(SANCTIONED)).toMatchObject([
        {
          sanction,
          emailHash: hashSanctionIdentifier("email", "appeal@example.com"),
        },
      ]);
      expect((await tombstonesOf(SANCTIONED))[0]!.sanctionEndsAt).toEqual(
        revised!.banEnd!,
      );
      // The deleted identity still enforces the revised sanction after an email change.
      expect(await register("user_old_email")).toMatchObject({ success: true });
      const oldEmailReport = await database.query.userReport.findFirst({
        where: eq(userReport.reportedUserId, "user_old_email"),
      });
      expect(oldEmailReport).toMatchObject({ status });
      expect(oldEmailReport!.banEnd).toEqual(revised!.banEnd);
      await deleteUser(database, "user_appealed");
      expect(await register("user_appealed")).toMatchObject({ success: true });
      const returnedReport = await database.query.userReport.findFirst({
        where: eq(userReport.reportedUserId, "user_appealed"),
      });
      expect(returnedReport).toMatchObject({ status });
      expect(returnedReport!.banEnd).toEqual(revised!.banEnd);
    },
  );

  it("clears every ancestor of an inherited ban while retaining an independent silence", async () => {
    const database = await getTestDatabase();
    const banEnd = new Date(Date.now() + 10 * DAY);
    const silenceEnd = new Date(Date.now() + 20 * DAY);
    await insertUsers([{ userId: SANCTIONED }]);
    await addSanction(SANCTIONED, "BAN_ACTIVATED", banEnd, "original-ban");
    await addSanction(SANCTIONED, "SILENCE_ACTIVATED", silenceEnd, "original-silence");
    const clerkUsers: Record<string, SanctionIdentity> = {
      [SANCTIONED]: identity("original@example.com"),
    };
    stubClerk(clerkUsers);
    let previousUserId = SANCTIONED;
    for (const [userId, email] of [
      ["user_second", "original@example.com"],
      ["user_third", "changed@example.com"],
      ["user_fourth", "changed-again@example.com"],
    ] as const) {
      clerkUsers[previousUserId] = identity(email);
      clerkUsers[userId] = identity(email);
      await removeAccountIdentity(previousUserId);
      delete clerkUsers[previousUserId];
      await deleteUser(database, previousUserId);
      expect(await register(userId)).toMatchObject({ success: true });
      previousUserId = userId;
    }
    const report = await database.query.userReport.findFirst({
      where: and(
        eq(userReport.reportedUserId, previousUserId),
        eq(userReport.status, "BAN_ACTIVATED"),
      ),
    });
    expect(
      await database.query.actionLog.findFirst({
        where: eq(actionLog.relatedId, report!.id),
      }),
    ).toMatchObject({
      changes: expect.arrayContaining([expect.stringContaining("original-ban")]),
    });
    await insertUsers([{ userId: "staff", role: "OWNER" }]);
    expect(
      await (await callerFor(reportsRouter, "staff")).clear({
        object_id: report!.id,
        comment: "Lift inherited ban",
        banTime: 1,
        banTimeUnit: "days",
      }),
    ).toMatchObject({ success: true });
    const retained = await database.query.sanctionTombstone.findMany();
    expect(retained).toMatchObject([
      { sanction: "SILENCE", sanctionEndsAt: silenceEnd },
      { sanction: "SILENCE", sanctionEndsAt: silenceEnd },
      { sanction: "SILENCE", sanctionEndsAt: silenceEnd },
    ]);
    expect(retained.map((source) => source.sanctionEndsAt)).toEqual([
      silenceEnd, silenceEnd, silenceEnd,
    ]);
    clerkUsers[previousUserId] = identity("original@example.com");
    await deleteUser(database, previousUserId);
    expect(await register(previousUserId)).toMatchObject({ success: true });
    expect(
      await database.query.userData.findFirst({
        where: eq(userData.userId, previousUserId),
      }),
    ).toMatchObject({ isBanned: false, isSilenced: true });
    expect(
      await database.query.userReport.findMany({
        where: eq(userReport.reportedUserId, previousUserId),
      }),
    ).toMatchObject([{ status: "SILENCE_ACTIVATED", banEnd: silenceEnd }]);
  });

  it.each(["ban", "silence"] as const)(
    "preserves a sanction revised into a %s when staff clear a separate longer sanction",
    async (decision) => {
      const database = await getTestDatabase();
      const status = decision === "ban" ? "BAN_ACTIVATED" : "SILENCE_ACTIVATED";
      const originalStatus = decision === "ban" ? "SILENCE_ACTIVATED" : "BAN_ACTIVATED";
      await insertUsers([{ userId: SANCTIONED }]);
      await addSanction(SANCTIONED, originalStatus, new Date(Date.now() + 10 * DAY));
      await addSanction(SANCTIONED, status, new Date(Date.now() + 20 * DAY));
      const clerkUsers: Record<string, SanctionIdentity> = {
        [SANCTIONED]: identity("conversion@example.com"),
        user_converted: identity("conversion@example.com"),
        user_old_identity: identity("conversion@example.com"),
      };
      stubClerk(clerkUsers);
      await removeAccountIdentity(SANCTIONED);
      delete clerkUsers[SANCTIONED];
      await deleteUser(database, SANCTIONED);
      await register("user_converted");
      clerkUsers.user_converted = identity("new-conversion@example.com");
      await insertUsers([{ userId: "staff", role: "OWNER" }]);
      const staff = await callerFor(reportsRouter, "staff");
      const reports = await database.query.userReport.findMany({
        where: eq(userReport.reportedUserId, "user_converted"),
      });
      const original = reports.find((report) => report.status === originalStatus)!;
      const separate = reports.find((report) => report.status === status)!;
      expect(
        await staff[decision]({
          object_id: original.id,
          comment: "Revise the inherited sanction",
          banTime: 1,
          banTimeUnit: "days",
        }),
      ).toMatchObject({ success: true });
      const revised = await database.query.userReport.findFirst({
        where: eq(userReport.id, original.id),
      });
      const sources = await tombstonesOf(SANCTIONED);
      const sanction = decision === "ban" ? "BAN" : "SILENCE";
      expect(sources).toHaveLength(2);
      expect(sources.every((source) => source.sanction === sanction)).toBe(true);
      expect(
        sources.find((source) => source.sourceId === `report-${status}`)!
          .sanctionEndsAt,
      ).toEqual(separate.banEnd!);
      expect(
        await staff.clear({
          object_id: separate.id,
          comment: "Lift the separate sanction",
          banTime: 1,
          banTimeUnit: "days",
        }),
      ).toMatchObject({ success: true });
      expect(await register("user_old_identity")).toMatchObject({ success: true });
      const inherited = await database.query.userReport.findMany({
        where: eq(userReport.reportedUserId, "user_old_identity"),
      });
      expect(inherited).toHaveLength(1);
      expect(inherited[0]!.status).toBe(status);
      expect(inherited[0]!.banEnd).toEqual(revised!.banEnd);
      await deleteUser(database, "user_converted");
      expect(await register("user_converted")).toMatchObject({ success: true });
      const returned = await database.query.userReport.findMany({
        where: eq(userReport.reportedUserId, "user_converted"),
      });
      expect(returned).toHaveLength(1);
      expect(returned[0]!.status).toBe(status);
      expect(returned[0]!.banEnd).toEqual(revised!.banEnd);
    },
  );
});
