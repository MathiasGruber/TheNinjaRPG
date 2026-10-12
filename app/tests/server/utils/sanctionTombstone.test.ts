import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as clerk from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
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
import { deleteUser } from "@/server/api/routers/staff";
import { removeAccountIdentity } from "@/server/utils/accountDeletion/identity";
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
  it("hashes plus-tags, case and Gmail dots of one mailbox alike", () => {
    expect(normalizeEmail(" J.Doe+alt@GoogleMail.com ")).toBe("jdoe@gmail.com");
    expect(normalizeEmail("j.doe+x@example.com")).toBe("j.doe@example.com");
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
        .values({ id: "tombstone-horizon", name: "Horizon", sector: 1, kageId: "kage" }),
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
    await insertUsers([{ userId: SANCTIONED, username: "Sanctioned", isSilenced: true }]);
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
      emailHash: hashSanctionIdentifier("email", "player@example.com"),
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
      { status: "BAN_ACTIVATED", banEnd, system: "sanction_carryover", adminResolved: true },
    ]);
    expect(reports[0]?.reason).not.toContain("original-ban");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ tableName: "userReport", relatedId: reports[0]?.id });
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
        emailHash: hashSanctionIdentifier("email", "returner@example.com"),
        accountHashes: [],
      }),
    );
    stubClerk({ user_returning: identity("Returner+2@EXAMPLE.com") });

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
      (await database.query.userData.findFirst({ where: eq(userData.userId, SANCTIONED) }))
        ?.isBanned,
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
      await database.query.userData.findFirst({ where: eq(userData.userId, SANCTIONED) }),
    ).toBeUndefined();
    expect(await tombstonesOf(SANCTIONED)).toMatchObject([{ sanction: "SILENCE" }]);
  });
});
