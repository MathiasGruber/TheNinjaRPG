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
  userReportComment,
  village,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { registerRouter } from "@/server/api/routers/register";
import { reportsRouter } from "@/server/api/routers/reports";
import { removeAccountGameData } from "@/server/utils/accountDeletion/cleanup";
import { processAccountDeletions } from "@/server/utils/accountDeletion/process";
import {
  hashSanctionIdentifier,
  recordSanctionTombstone,
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
              reportIds: ["independent-ban"],
              sanctionEndsAt: shorterEnd,
            }),
            expect.objectContaining({
              ...hashes,
              reportIds: ["independent-silence"],
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
      expect(sources).toHaveLength(2);
      expect(sources.every((source) => source.emailHash === hashes.emailHash)).toBe(
        true,
      );
      expect(
        sources.find(
          (source) => source.sanction === (decision === "ban" ? "SILENCE" : "BAN"),
        ),
      ).toMatchObject({
        reportIds: ["independent-same"],
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
        expect(snapshot.some((source) => source.sourceSanction === "BAN")).toBe(false);
      } else {
        expect(
          snapshot.find((source) => source.sourceSanction === "BAN"),
        ).toMatchObject({
          ...hashes,
          sanction: decision === "ban" ? "BAN" : "SILENCE",
          sanctionEndsAt: revised!.banEnd,
        });
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
          snapshot.find((source) => source.sourceSanction === "SILENCE"),
        ).toMatchObject({
          ...hashes,
          sanction: "SILENCE",
          sanctionEndsAt: independentEnd,
          reportIds: ["independent-silence"],
        });
      } else if (decision === "clear") {
        expect(await database.query.sanctionTombstone.findMany()).toHaveLength(0);
      }
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
