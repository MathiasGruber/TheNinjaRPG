import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import * as clerk from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import {
  accountDeletion,
  actionLog,
  bloodline,
  sanctionTombstone,
  storeUserIdAlias,
  userData,
  userReport,
  type UserReport,
  userReportComment,
  village,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { registerRouter } from "@/server/api/routers/register";
import { reportsRouter } from "@/server/api/routers/reports";
import { removeAccountGameData } from "@/server/utils/accountDeletion/cleanup";
import { processAccountDeletions } from "@/server/utils/accountDeletion/process";
import * as sanctions from "@/server/utils/sanctionTombstone";
import {
  hashSanctionIdentifier,
  recordSanctionTombstone,
  type SanctionIdentity,
} from "@/server/utils/sanctionTombstone";
import { insertUsers } from "../../setup/factories";
import {
  callerFor,
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const DAY = 86_400_000;
const NATIVE_USER = "native-deleting";
const identity: SanctionIdentity = {
  primaryEmailAddressId: "primary",
  emailAddresses: [
    {
      id: "primary",
      emailAddress: "native-appeal@example.com",
      verification: { status: "verified" },
    },
  ],
  externalAccounts: [{ provider: "oauth_google", providerUserId: "native-subject" }],
};
const hashes = {
  emailHash: hashSanctionIdentifier("email", "native-appeal@example.com"),
  accountHashes: [hashSanctionIdentifier("oauth", "google:native-subject")],
};

const addReport = async (
  id: string,
  status: "BAN_ACTIVATED" | "SILENCE_ACTIVATED" | "TIMEOUT_ACTIVATED",
  end: Date,
) =>
  (await getTestDatabase()).insert(userReport).values({
    id,
    reporterUserId: "staff",
    reportedUserId: NATIVE_USER,
    system: "tavern_comment",
    infraction: {},
    reason: "Spam",
    aiInterpretation: "",
    status,
    banEnd: end,
  });

const startDeletion = async () => {
  const database = await getTestDatabase();
  await database.insert(accountDeletion).values({ userId: NATIVE_USER });
  expect(await processAccountDeletions(NATIVE_USER)).toEqual({
    processed: 1,
    failed: 0,
  });
  const job = await database.query.accountDeletion.findFirst({
    where: eq(accountDeletion.userId, NATIVE_USER),
  });
  expect(job).toMatchObject({ phase: "IDENTITY_DELETED" });
  expect(job!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 299_000);
  expect(await database.query.userReport.findFirst()).toBeDefined();
  expect(
    await database.query.userData.findFirst({
      where: eq(userData.userId, NATIVE_USER),
    }),
  ).toBeDefined();
  expect(await database.query.sanctionTombstone.findMany()).toEqual(
    expect.arrayContaining([expect.objectContaining(hashes)]),
  );
};

const finishDeletion = async (userId = NATIVE_USER) => {
  const database = await getTestDatabase();
  await database
    .update(accountDeletion)
    .set({ nextAttemptAt: new Date(Date.now() - 1) })
    .where(eq(accountDeletion.userId, userId));
  expect(await processAccountDeletions(userId)).toEqual({
    processed: 1,
    failed: 0,
  });
  expect(
    await database.query.accountDeletion.findFirst({
      where: eq(accountDeletion.userId, userId),
    }),
  ).toMatchObject({ phase: "COMPLETE" });
  expect(
    await database.query.userReport.findFirst({
      where: eq(userReport.reportedUserId, userId),
    }),
  ).toBeUndefined();
};

const register = async (userId: string) => {
  expect(
    await (await callerFor(registerRouter, userId)).createCharacter({
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
      bloodlineId: "native-bloodline",
    }),
  ).toMatchObject({ success: true });
  return (await getTestDatabase()).query.userReport.findMany({
    where: eq(userReport.reportedUserId, userId),
  });
};

const decisionInput = {
  object_id: "original",
  comment: "Revise the original case after an appeal",
  banTime: 1,
  banTimeUnit: "days" as const,
};

/** Native re-registration can reuse an identity only after its Clerk owner is deleted. */
const stubSingleIdentity = () => {
  const liveOwners = new Map([[NATIVE_USER, identity]]);
  vi.spyOn(clerk, "clerkClient").mockResolvedValue({
    users: {
      getUser: vi.fn(async (userId: string) => {
        const owner = liveOwners.get(userId);
        if (!owner) throw Object.assign(new Error("not found"), { status: 404 });
        return owner;
      }),
      deleteUser: vi.fn(async (userId: string) => {
        liveOwners.delete(userId);
      }),
    },
  } as never);
  return {
    register: async (userId: string) => {
      expect(liveOwners.size).toBe(0);
      liveOwners.set(userId, identity);
      return register(userId);
    },
    replace: (userId: string, replacement: SanctionIdentity) => {
      expect(liveOwners.has(userId)).toBe(true);
      liveOwners.set(userId, replacement);
    },
  };
};

const deleteReplacement = async () => {
  await (await getTestDatabase())
    .insert(accountDeletion)
    .values({ userId: "DuringDelay" });
  expect(await processAccountDeletions("DuringDelay")).toEqual({
    processed: 1,
    failed: 0,
  });
  await finishDeletion("DuringDelay");
};

/** Pause an atomic decision write to interleave authorized actions and cleanup. */
const pauseNextDecision = async (beforeWrite = false) => {
  const database = await getTestDatabase();
  const execute = database.execute.bind(database);
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let paused = false;
  const client = new Proxy(database, {
    get(target, property, receiver) {
      if (property === "execute") {
        return async (...args: Parameters<typeof execute>) => {
          if (paused) return execute(...args);
          paused = true;
          if (beforeWrite) {
            enter();
            await gate;
          }
          const result = await execute(...args);
          if (!beforeWrite) {
            enter();
            await gate;
          }
          return result;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { client, entered, release };
};

describeWithDatabase("original sanctions during native deletion", () => {
  beforeEach(async () => {
    await resetTables(
      accountDeletion,
      actionLog,
      bloodline,
      sanctionTombstone,
      storeUserIdAlias,
      userData,
      userReport,
      userReportComment,
      village,
    );
    const database = await getTestDatabase();
    await Promise.all([
      insertUsers([{ userId: "staff", role: "OWNER" }, { userId: NATIVE_USER }]),
      database
        .insert(village)
        .values({ id: "native-horizon", name: "Horizon", sector: 1, kageId: "kage" }),
      database.insert(bloodline).values({
        id: "native-bloodline",
        name: "Native bloodline",
        image: "/bloodline.png",
        description: "test",
        effects: [],
        rank: "D",
      }),
    ]);
    const deletedIdentities = new Set<string>();
    vi.spyOn(clerk, "clerkClient").mockResolvedValue({
      users: {
        getUser: vi.fn(async (userId: string) => {
          if (deletedIdentities.has(userId))
            throw Object.assign(new Error("not found"), { status: 404 });
          return identity;
        }),
        deleteUser: vi.fn(async (userId: string) => {
          deletedIdentities.add(userId);
        }),
      },
    } as never);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await resetTables(sanctionTombstone);
  });

  it.each([
    ["BAN_ACTIVATED", "warn"],
    ["SILENCE_ACTIVATED", "warn"],
    ["BAN_ACTIVATED", "tradeBan"],
    ["SILENCE_ACTIVATED", "tradeBan"],
  ] as const)(
    "retires original %s replaced by %s before and after game cleanup",
    async (status, decision) => {
      await addReport("original", status, new Date(Date.now() + 10 * DAY));
      await startDeletion();
      expect(
        await (await callerFor(reportsRouter, "staff"))[decision](decisionInput),
      ).toMatchObject({ success: true });
      expect(await register("DuringDelay")).toHaveLength(0);
      await finishDeletion();
      expect(await register("AfterCleanup")).toHaveLength(0);
      expect(
        await (await getTestDatabase()).query.sanctionTombstone.findMany(),
      ).toHaveLength(0);
    },
  );

  it.each([
    ["BAN_ACTIVATED", "silence", "SILENCE_ACTIVATED"],
    ["SILENCE_ACTIVATED", "ban", "BAN_ACTIVATED"],
  ] as const)(
    "preserves captured identifiers when original %s changes via %s",
    async (status, decision, revisedStatus) => {
      await addReport("original", status, new Date(Date.now() + 10 * DAY));
      await startDeletion();
      expect(
        await (await callerFor(reportsRouter, "staff"))[decision](decisionInput),
      ).toMatchObject({ success: true });
      const revised = await (await getTestDatabase()).query.userReport.findFirst({
        where: eq(userReport.id, "original"),
      });
      for (const userId of ["DuringDelay", "AfterCleanup"]) {
        if (userId === "AfterCleanup") await finishDeletion();
        const reports = await register(userId);
        expect(reports).toHaveLength(1);
        expect(reports[0]).toMatchObject({
          status: revisedStatus,
          banEnd: revised!.banEnd,
        });
        expect(
          await (await getTestDatabase()).query.sanctionTombstone.findMany(),
        ).toMatchObject([
          { ...hashes, sanction: decision === "ban" ? "BAN" : "SILENCE" },
        ]);
      }
    },
  );

  it.each(["clear", "warn", "tradeBan"] as const)(
    "keeps a shorter independent ban and a separate silence after %s",
    async (decision) => {
      const shorterEnd = new Date(Date.now() + 3 * DAY);
      const silenceEnd = new Date(Date.now() + 20 * DAY);
      await addReport("original", "BAN_ACTIVATED", new Date(Date.now() + 10 * DAY));
      await addReport("independent-ban", "BAN_ACTIVATED", shorterEnd);
      await addReport("independent-silence", "SILENCE_ACTIVATED", silenceEnd);
      await startDeletion();
      expect(
        await (await callerFor(reportsRouter, "staff"))[decision](decisionInput),
      ).toMatchObject({ success: true });
      for (const userId of ["DuringDelay", "AfterCleanup"]) {
        if (userId === "AfterCleanup") await finishDeletion();
        const reports = await register(userId);
        expect(reports).toHaveLength(2);
        expect(reports).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ status: "BAN_ACTIVATED", banEnd: shorterEnd }),
            expect.objectContaining({
              status: "SILENCE_ACTIVATED",
              banEnd: silenceEnd,
            }),
          ]),
        );
        const sources = await (
          await getTestDatabase()
        ).query.sanctionTombstone.findMany();
        expect(sources).toHaveLength(2);
        expect(sources).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ...hashes,
              sourceId: "independent-ban",
              sanctionEndsAt: shorterEnd,
            }),
            expect.objectContaining({
              ...hashes,
              sourceId: "independent-silence",
              sanctionEndsAt: silenceEnd,
            }),
          ]),
        );
      }
    },
  );

  it.each([
    ["BAN_ACTIVATED", "silence", "SILENCE_ACTIVATED"],
    ["SILENCE_ACTIVATED", "ban", "BAN_ACTIVATED"],
  ] as const)(
    "keeps independent reports when one of a grouped %s converts via %s",
    async (status, decision, revisedStatus) => {
      const independentEnd = new Date(Date.now() + 3 * DAY);
      await addReport("original", status, new Date(Date.now() + 10 * DAY));
      await addReport("independent-same", status, independentEnd);
      await addReport(
        "independent-other",
        revisedStatus,
        new Date(Date.now() + 20 * DAY),
      );
      await startDeletion();
      const staff = await callerFor(reportsRouter, "staff");
      expect(await staff[decision](decisionInput)).toMatchObject({ success: true });
      const revised = await (await getTestDatabase()).query.userReport.findFirst({
        where: eq(userReport.id, "original"),
      });
      const sources = await (
        await getTestDatabase()
      ).query.sanctionTombstone.findMany();
      expect(sources).toHaveLength(3);
      expect(sources.every((source) => source.emailHash === hashes.emailHash)).toBe(
        true,
      );
      expect(
        sources.find(
          (source) => source.sanction === (decision === "ban" ? "SILENCE" : "BAN"),
        ),
      ).toMatchObject({
        sourceId: "independent-same",
        sanctionEndsAt: independentEnd,
      });
      expect(
        await staff.clear({ ...decisionInput, object_id: "independent-other" }),
      ).toMatchObject({ success: true });
      const duringDelay = await register("DuringDelay");
      expect(duringDelay).toHaveLength(2);
      expect(duringDelay).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status, banEnd: independentEnd }),
          expect.objectContaining({ status: revisedStatus, banEnd: revised!.banEnd }),
        ]),
      );
      await finishDeletion();
      expect(await register("AfterCleanup")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status, banEnd: independentEnd }),
          expect.objectContaining({ status: revisedStatus, banEnd: revised!.banEnd }),
        ]),
      );
    },
  );

  it.each(["ban", "silence", "timeout"] as const)(
    "uses the revised original deadline immediately after staff %s",
    async (decision) => {
      await addReport(
        "original",
        decision === "timeout" ? "TIMEOUT_ACTIVATED" : "BAN_ACTIVATED",
        new Date(Date.now() + (decision === "timeout" ? 30 * 60_000 : 10 * DAY)),
      );
      await startDeletion();
      if (decision === "timeout") {
        await (await getTestDatabase())
          .update(userData)
          .set({ role: "CONTENT-ADMIN" })
          .where(eq(userData.userId, "staff"));
      }
      expect(
        await (await callerFor(reportsRouter, "staff"))[decision](decisionInput),
      ).toMatchObject({ success: true });
      const revised = await (await getTestDatabase()).query.userReport.findFirst({
        where: eq(userReport.id, "original"),
      });
      const status = decision === "ban" ? "BAN_ACTIVATED" : "SILENCE_ACTIVATED";
      expect(await register("DuringDelay")).toMatchObject([
        { status, banEnd: revised!.banEnd },
      ]);
      await finishDeletion();
      expect(await register("AfterCleanup")).toMatchObject([
        { status, banEnd: revised!.banEnd },
      ]);
    },
  );

  it("carries an unchanged original ban through both native deletion stages", async () => {
    const end = new Date(Date.now() + 10 * DAY);
    await addReport("original", "BAN_ACTIVATED", end);
    await startDeletion();
    await finishDeletion();
    expect(await register("AfterCleanup")).toMatchObject([
      { status: "BAN_ACTIVATED", banEnd: end },
    ]);
  });

  it.each([
    ["ban", true],
    ["silence", true],
    ["clear", true],
    ["silence", false],
    ["clear", false],
  ] as const)(
    "preserves carryover %s through native cleanup with independent silence: %p",
    async (decision, hasIndependentSilence) => {
      const database = await getTestDatabase();
      const originalEnd = new Date(Date.now() + 10 * DAY);
      const independentEnd = new Date(Date.now() + 20 * DAY);
      await addReport("original", "BAN_ACTIVATED", originalEnd);
      if (hasIndependentSilence)
        await addReport("independent-silence", "SILENCE_ACTIVATED", independentEnd);
      await startDeletion();
      const duringDelay = await register("DuringDelay");
      const inherited = duringDelay.find(
        (report) => report.status === "BAN_ACTIVATED",
      )!;
      expect(
        await (await callerFor(reportsRouter, "staff"))[decision]({
          ...decisionInput,
          object_id: inherited.id,
          banTime: decision === "ban" ? 20 : 1,
        }),
      ).toMatchObject({ success: true });
      const revised = await database.query.userReport.findFirst({
        where: eq(userReport.id, inherited.id),
      });
      const snapshot = await database.query.sanctionTombstone.findMany({
        where: eq(sanctionTombstone.userId, NATIVE_USER),
      });
      if (decision === "clear") {
        expect(snapshot.some((source) => source.sourceId === "original")).toBe(false);
      } else {
        expect(snapshot.find((source) => source.sourceId === "original")).toMatchObject(
          {
            ...hashes,
            sanction: decision === "ban" ? "BAN" : "SILENCE",
            sanctionEndsAt: revised!.banEnd,
          },
        );
      }
      await recordSanctionTombstone(database, NATIVE_USER, null);
      expect(
        await database.query.sanctionTombstone.findMany({
          where: eq(sanctionTombstone.userId, NATIVE_USER),
        }),
      ).toEqual(snapshot);
      await finishDeletion();
      expect(
        await database.query.sanctionTombstone.findMany({
          where: eq(sanctionTombstone.userId, NATIVE_USER),
        }),
      ).toEqual(snapshot);
      // A retry after the reports are gone must preserve the retained staff decision.
      await removeAccountGameData(NATIVE_USER);
      expect(
        await database.query.sanctionTombstone.findMany({
          where: eq(sanctionTombstone.userId, NATIVE_USER),
        }),
      ).toEqual(snapshot);

      // Release the replacement's sign-in identity before another account reuses it.
      await database.insert(accountDeletion).values({ userId: "DuringDelay" });
      expect(await processAccountDeletions("DuringDelay")).toEqual({
        processed: 1,
        failed: 0,
      });
      await finishDeletion("DuringDelay");
      const returned = await register("AfterCleanup");
      const expected = [
        ...(decision === "ban"
          ? [{ status: "BAN_ACTIVATED", banEnd: revised!.banEnd }]
          : []),
        ...(hasIndependentSilence
          ? [{ status: "SILENCE_ACTIVATED", banEnd: independentEnd }]
          : decision === "silence"
            ? [{ status: "SILENCE_ACTIVATED", banEnd: revised!.banEnd }]
            : []),
      ];
      expect(returned).toHaveLength(expected.length);
      expect(returned).toEqual(
        expect.arrayContaining(
          expected.map((report) => expect.objectContaining(report)),
        ),
      );
      if (hasIndependentSilence) {
        expect(
          snapshot.find((source) => source.sourceId === "independent-silence"),
        ).toMatchObject({
          ...hashes,
          sanction: "SILENCE",
          sanctionEndsAt: independentEnd,
        });
      } else if (decision === "clear") {
        expect(await database.query.sanctionTombstone.findMany()).toHaveLength(0);
      }
    },
  );

  it.each([
    ["ban", false],
    ["silence", false],
    ["clear", false],
    ["ban", true],
    ["silence", true],
    ["clear", true],
  ] as const)(
    "preserves carryover %s across an independent original edit: %p",
    async (decision, editIndependent) => {
      const { register: registerIdentity } = stubSingleIdentity();
      const database = await getTestDatabase();
      const independentEnd = new Date(Date.now() + 20 * DAY);
      await addReport("original", "BAN_ACTIVATED", new Date(Date.now() + 10 * DAY));
      await addReport("independent-silence", "SILENCE_ACTIVATED", independentEnd);
      await startDeletion();
      const inherited = (await registerIdentity("DuringDelay")).find(
        (report) => report.status === "BAN_ACTIVATED",
      )!;
      const staff = await callerFor(reportsRouter, "staff");
      expect(
        await staff[decision]({ ...decisionInput, object_id: inherited.id }),
      ).toMatchObject({ success: true });
      const revised = await database.query.userReport.findFirst({
        where: eq(userReport.id, inherited.id),
      });
      const before = await database.query.sanctionTombstone.findMany();
      if (editIndependent) {
        expect(
          await staff.clear({ ...decisionInput, object_id: "independent-silence" }),
        ).toMatchObject({ success: true });
      }
      const expected = before.filter(
        (source) => !editIndependent || source.sourceId !== "independent-silence",
      );
      expect(await database.query.sanctionTombstone.findMany()).toEqual(expected);
      await recordSanctionTombstone(database, NATIVE_USER, null);
      await finishDeletion();
      await removeAccountGameData(NATIVE_USER);
      expect(await database.query.sanctionTombstone.findMany()).toEqual(expected);
      await deleteReplacement();
      const returned = await registerIdentity("AfterCleanup");
      const returnedBan = returned.find((report) => report.status === "BAN_ACTIVATED");
      if (decision === "ban") {
        expect(returnedBan).toMatchObject({ banEnd: revised!.banEnd });
      } else {
        expect(returnedBan).toBeUndefined();
      }
      // The replacement's separate silence remains its own live moderation case.
      expect(
        returned.find((report) => report.status === "SILENCE_ACTIVATED"),
      ).toMatchObject({ banEnd: independentEnd });
      expect(returned).toHaveLength(decision === "ban" ? 2 : 1);
      const active = await (await callerFor(reportsRouter, "AfterCleanup")).getBan();
      expect(active?.status === "BAN_ACTIVATED").toBe(decision === "ban");
      expect(
        await database.query.userData.findFirst({
          columns: { isBanned: true, isSilenced: true },
          where: eq(userData.userId, "AfterCleanup"),
        }),
      ).toEqual({ isBanned: decision === "ban", isSilenced: true });
    },
  );

  it.each([
    ["BAN_ACTIVATED", "SILENCE_ACTIVATED", "silence", "ban"],
    ["SILENCE_ACTIVATED", "BAN_ACTIVATED", "ban", "silence"],
  ] as const)(
    "keeps each original %s case's carryover decision after one case is revised and cleared",
    async (originalStatus, convertedStatus, convert, independentDecision) => {
      const { register: registerIdentity, replace } = stubSingleIdentity();
      const database = await getTestDatabase();
      await addReport("original", originalStatus, new Date(Date.now() + 10 * DAY));
      await addReport(
        "independent-same",
        originalStatus,
        new Date(Date.now() + 3 * DAY),
      );
      await addReport(
        "independent-other",
        convertedStatus,
        new Date(Date.now() + 20 * DAY),
      );
      await startDeletion();
      const inherited = await registerIdentity("DuringDelay");
      expect(inherited).toHaveLength(2);
      const grouped = inherited.find((report) => report.status === originalStatus)!;
      const independent = inherited.find(
        (report) => report.status === convertedStatus,
      )!;
      const staff = await callerFor(reportsRouter, "staff");
      expect(
        await staff[convert]({ ...decisionInput, object_id: grouped.id }),
      ).toMatchObject({ success: true });
      expect(
        await staff[independentDecision]({
          ...decisionInput,
          object_id: independent.id,
          banTime: 2,
        }),
      ).toMatchObject({ success: true });
      const before = await database.query.sanctionTombstone.findMany();
      const remaining = before.find(
        (source) => source.sourceId === "independent-same",
      )!;
      const separate = before.find(
        (source) => source.sourceId === "independent-other",
      )!;
      expect(await staff[convert]({ ...decisionInput, banTime: 4 })).toMatchObject({
        success: true,
      });
      const revised = await database.query.userReport.findFirst({
        where: eq(userReport.id, "original"),
      });
      expect(await database.query.sanctionTombstone.findMany()).toEqual(
        expect.arrayContaining([
          remaining,
          separate,
          expect.objectContaining({
            sourceId: "original",
            ...hashes,
            sanction: convert === "ban" ? "BAN" : "SILENCE",
            sanctionEndsAt: revised!.banEnd,
            carryoverReportIds: [grouped.id],
          }),
        ]),
      );
      expect(await staff.clear(decisionInput)).toMatchObject({ success: true });
      const expected = [remaining, separate].sort((a, b) =>
        a.sourceId.localeCompare(b.sourceId),
      );
      expect(await database.query.sanctionTombstone.findMany()).toEqual(expected);
      await finishDeletion();
      await removeAccountGameData(NATIVE_USER);
      expect(await database.query.sanctionTombstone.findMany()).toEqual(expected);
      // Only the original account's captured identifiers can match the next account.
      replace("DuringDelay", {
        primaryEmailAddressId: "changed-email",
        emailAddresses: [
          {
            id: "changed-email",
            emailAddress: "changed-native@example.com",
            verification: { status: "verified" },
          },
        ],
        externalAccounts: [],
      });
      await deleteReplacement();
      const returned = await registerIdentity("AfterCleanup");
      expect(returned).toHaveLength(2);
      expect(returned).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: convertedStatus,
            banEnd: remaining.sanctionEndsAt,
          }),
          expect.objectContaining({
            status: originalStatus,
            banEnd: separate.sanctionEndsAt,
          }),
        ]),
      );
      expect(
        await database.query.actionLog.findMany({
          where: eq(actionLog.userId, "AfterCleanup"),
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.stringContaining("independent-same"),
            ]),
          }),
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.stringContaining("independent-other"),
            ]),
          }),
        ]),
      );
    },
  );

  it.each([
    ["ban", "silence"],
    ["silence", "ban"],
    ["ban", "ban"],
    ["ban", "clear"],
  ] as const)(
    "keeps the later %s → %s decision when an earlier response is delayed across cleanup",
    async (earlier, later) => {
      const { register: registerIdentity } = stubSingleIdentity();
      const database = await getTestDatabase();
      await addReport("original", "BAN_ACTIVATED", new Date(Date.now() + 10 * DAY));
      await startDeletion();
      const { client, entered, release } = await pauseNextDecision();
      const staff = callerForDatabase(reportsRouter, "staff", client);
      const pending = staff[earlier](decisionInput);
      await entered;
      let current!: UserReport;
      try {
        expect(await staff[later]({ ...decisionInput, banTime: 2 })).toMatchObject({
          success: true,
        });
        current = (await database.query.userReport.findFirst({
          where: eq(userReport.id, "original"),
        }))!;
        const active = await sanctions.fetchActiveSanctionTombstones(database);
        expect(active).toHaveLength(later === "clear" ? 0 : 1);
        if (later !== "clear")
          expect(active[0]).toMatchObject({
            sanction: later === "ban" ? "BAN" : "SILENCE",
            sanctionEndsAt: current.banEnd,
            ...hashes,
          });
        await finishDeletion();
      } finally {
        release();
      }
      expect(await pending).toMatchObject({ success: true });
      const returned = await registerIdentity("AfterCleanup");
      expect(returned).toHaveLength(later === "clear" ? 0 : 1);
      if (later !== "clear")
        expect(returned[0]).toMatchObject({
          status: current.status,
          banEnd: current.banEnd,
          adminResolved: true,
        });
    },
  );

  it.each(["ban", "silence"] as const)(
    "keeps an authorized %s decision after a concurrent clear's delayed pruning",
    async (decision) => {
      const { register: registerIdentity } = stubSingleIdentity();
      const database = await getTestDatabase();
      await addReport("original", "BAN_ACTIVATED", new Date(Date.now() + 10 * DAY));
      await startDeletion();
      // Both actions pass moderation guards while the report is still resolvable.
      const later = await pauseNextDecision(true);
      const pending = callerForDatabase(reportsRouter, "staff", later.client)[decision](
        decisionInput,
      );
      await later.entered;
      const earlier = await pauseNextDecision();
      const clearing = callerForDatabase(reportsRouter, "staff", earlier.client).clear(
        decisionInput,
      );
      await earlier.entered;
      let current!: UserReport;
      try {
        later.release();
        expect(await pending).toMatchObject({ success: true });
        current = (await database.query.userReport.findFirst({
          where: eq(userReport.id, "original"),
        }))!;
        await finishDeletion();
      } finally {
        later.release();
        earlier.release();
      }
      expect(await clearing).toMatchObject({ success: true });
      expect(await sanctions.fetchActiveSanctionTombstones(database)).toMatchObject([
        {
          sanction: decision === "ban" ? "BAN" : "SILENCE",
          sanctionEndsAt: current.banEnd,
        },
      ]);
      expect(await registerIdentity("AfterCleanup")).toMatchObject([
        { status: current.status, banEnd: current.banEnd },
      ]);
    },
  );

  it.each(["ban", "silence", "clear"] as const)(
    "keeps the latest %s decision when cleanup removes its report before the response",
    async (decision) => {
      const { register: registerIdentity } = stubSingleIdentity();
      const database = await getTestDatabase();
      await addReport("original", "BAN_ACTIVATED", new Date(Date.now() + 10 * DAY));
      await startDeletion();
      const { client, entered, release } = await pauseNextDecision();
      const pending = callerForDatabase(reportsRouter, "staff", client)[decision](
        decisionInput,
      );
      await entered;
      const current = (await database.query.userReport.findFirst({
        where: eq(userReport.id, "original"),
      }))!;
      try {
        await finishDeletion();
      } finally {
        release();
      }
      expect(await pending).toMatchObject({ success: true });
      const returned = await registerIdentity("AfterCleanup");
      expect(returned).toHaveLength(decision === "clear" ? 0 : 1);
      if (decision !== "clear")
        expect(returned[0]).toMatchObject({
          status: current.status,
          banEnd: current.banEnd,
        });
    },
  );

  it("does not retain identifiers when an ordinary account receives a sanction", async () => {
    await addReport("original", "BAN_ACTIVATED", new Date(Date.now() + 10 * DAY));
    expect(
      await (await callerFor(reportsRouter, "staff")).silence(decisionInput),
    ).toMatchObject({ success: true });
    expect(
      await (await getTestDatabase()).query.sanctionTombstone.findMany(),
    ).toHaveLength(0);
  });
});
