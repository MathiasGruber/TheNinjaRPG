import { createHmac } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  type BanState,
  type SanctionTombstoneType,
  TERR_BOT_ID,
} from "@/drizzle/constants";
import {
  actionLog,
  type SanctionTombstone,
  sanctionTombstone,
  userReport,
  userReportComment,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { getIpHashSecret } from "@/server/utils/ipHash";

/**
 * Sanction tombstones let a banned or silenced player delete their account (GDPR Art. 17,
 * App Store and Google Play account-deletion rules) without escaping the sanction by
 * registering again.
 *
 * Deleting an account while a ban or silence still runs stores one row per sanction type:
 * the Clerk user id, keyed hashes of the primary email and of every linked OAuth account,
 * the end date and the ids of the reports that imposed it. Nothing about the character, its
 * chat or its IPs is kept, and the hourly cleaner removes the row once the sanction ends.
 *
 * The web character deletion keeps the Clerk user, so the same Clerk id returns on the next
 * registration. The native account deletion deletes the Clerk user, so a returning player
 * gets a new Clerk id and only the email and OAuth hashes can match. A new character that
 * matches serves the remainder: it gets a new report with the same type and end date, so
 * the ordinary ban and silence screens, expiry and staff tools apply to it unchanged.
 */

/** The fields this module reads from a Clerk user. */
export type SanctionIdentity = {
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
  externalAccounts: { provider: string; providerUserId: string }[];
};

type ActiveSanction = {
  sanction: SanctionTombstoneType;
  endsAt: Date;
  reportIds: string[];
};

export type SanctionMatch = ActiveSanction & {
  matchedBy: ("clerkId" | "email" | "oauth")[];
  tombstones: SanctionTombstone[];
};

const SANCTION_REPORT_STATES = {
  BAN_ACTIVATED: "BAN",
  SILENCE_ACTIVATED: "SILENCE",
  TIMEOUT_ACTIVATED: "SILENCE",
} as const satisfies Partial<Record<BanState, SanctionTombstoneType>>;

const REAPPLIED_STATE: Record<SanctionTombstoneType, BanState> = {
  BAN: "BAN_ACTIVATED",
  SILENCE: "SILENCE_ACTIVATED",
};

/**
 * Fold Gmail's documented aliases. Other providers can treat plus signs and dots as
 * distinct mailboxes, so preserve their local parts to avoid sanctioning another owner.
 */
export const normalizeEmail = (email: string) => {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  const local =
    domain === "gmail.com"
      ? (rawLocal.split("+")[0] ?? "").replaceAll(".", "")
      : rawLocal;
  return `${local}@${domain}`;
};

/** Clerk names providers both `oauth_google` and `google`; treat them as one. */
const normalizeProvider = (provider: string) =>
  provider
    .trim()
    .toLowerCase()
    .replace(/^oauth_/, "");

/**
 * HMAC-SHA256 keyed with the app-wide hashing secret, labelled per identifier kind so a
 * value never hashes alike across kinds or across features that share the key.
 */
export const hashSanctionIdentifier = (kind: "email" | "oauth", value: string) =>
  createHmac("sha256", getIpHashSecret())
    .update(`sanction-tombstone:${kind}:${value}`)
    .digest("hex");

const accountHashesOf = (identity: SanctionIdentity) => [
  ...new Set(
    identity.externalAccounts
      .filter((account) => account.providerUserId)
      .map((account) =>
        hashSanctionIdentifier(
          "oauth",
          `${normalizeProvider(account.provider)}:${account.providerUserId}`,
        ),
      ),
  ),
];

const primaryEmailHashOf = (identity: SanctionIdentity) => {
  const primary = identity.emailAddresses.find(
    (email) => email.id === identity.primaryEmailAddressId,
  );
  return primary?.verification?.status === "verified"
    ? hashSanctionIdentifier("email", normalizeEmail(primary.emailAddress))
    : null;
};

/** Load the Clerk user, or null when Clerk has already deleted it. */
export const fetchSanctionIdentity = async (
  userId: string,
): Promise<SanctionIdentity | null> => {
  try {
    return await (await clerkClient()).users.getUser(userId);
  } catch (error) {
    if (isClerkNotFound(error)) return null;
    throw error;
  }
};

export const isClerkNotFound = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  error.status === 404;

/** Bans and silences (timeouts included) still running for this account. */
const fetchActiveSanctions = async (
  client: DrizzleClient,
  userId: string,
): Promise<ActiveSanction[]> => {
  const reports = await client.query.userReport.findMany({
    columns: { id: true, status: true, banEnd: true },
    where: and(
      eq(userReport.reportedUserId, userId),
      inArray(
        userReport.status,
        Object.keys(SANCTION_REPORT_STATES) as (keyof typeof SANCTION_REPORT_STATES)[],
      ),
      gt(userReport.banEnd, new Date()),
    ),
  });
  const sanctions = new Map<SanctionTombstoneType, ActiveSanction>();
  for (const report of reports) {
    if (!report.banEnd) continue;
    const sanction =
      SANCTION_REPORT_STATES[report.status as keyof typeof SANCTION_REPORT_STATES];
    const current = sanctions.get(sanction);
    sanctions.set(sanction, {
      sanction,
      endsAt:
        current && current.endsAt > report.banEnd ? current.endsAt : report.banEnd,
      reportIds: [...(current?.reportIds ?? []), report.id],
    });
  }
  return [...sanctions.values()];
};

/**
 * Store a tombstone for every sanction still running on this account. Call it before the
 * account's reports or its Clerk user are removed.
 *
 * Pass the Clerk user when the caller already holds it; otherwise it is loaded, and only
 * when a sanction exists. A Clerk user that is already gone (the native deletion removes it
 * first) leaves hashes stored by an earlier call untouched. Repeating the call is harmless.
 */
export const recordSanctionTombstone = async (
  client: DrizzleClient,
  userId: string,
  identity?: SanctionIdentity | null,
) => {
  const [sanctions, sources] = await Promise.all([
    fetchActiveSanctions(client, userId),
    client.query.sanctionTombstone.findMany({
      where: eq(sanctionTombstone.userId, userId),
    }),
  ]);
  const clerkUser =
    sanctions.length === 0
      ? null
      : identity === undefined
        ? await fetchSanctionIdentity(userId)
        : identity;
  const hashes = clerkUser
    ? {
        emailHash: primaryEmailHashOf(clerkUser),
        accountHashes: accountHashesOf(clerkUser),
      }
    : hashesOfSources(sources);
  await replaceSanctionSnapshot(client, userId, sanctions, sources, hashes);
};

const hashesOfSources = (sources: SanctionTombstone[]) => ({
  emailHash: sources.find((source) => source.emailHash)?.emailHash ?? null,
  accountHashes: [...new Set(sources.flatMap((source) => source.accountHashes))],
});

/** Replace the account's snapshot while its original reports still exist. */
const replaceSanctionSnapshot = async (
  client: DrizzleClient,
  userId: string,
  sanctions: ActiveSanction[],
  sources: SanctionTombstone[],
  hashes: ReturnType<typeof hashesOfSources>,
) => {
  const obsolete = sources.filter(
    (source) => !sanctions.some((entry) => entry.sanction === source.sourceSanction),
  );
  await Promise.all([
    ...sanctions.map((entry) => {
      const sanctionFields = {
        sanction: entry.sanction,
        sanctionEndsAt: entry.endsAt,
        reportIds: entry.reportIds,
      };
      return client
        .insert(sanctionTombstone)
        .values({
          userId,
          sourceSanction: entry.sanction,
          ...sanctionFields,
          ...hashes,
          // A type conversion must keep links to registrations made during the native
          // deletion delay, even when it needs a new row after Clerk is already gone.
          carryoverReportIds: [
            ...new Set(
              sources
                .filter((source) =>
                  source.reportIds.some((id) => entry.reportIds.includes(id)),
                )
                .flatMap((source) => source.carryoverReportIds),
            ),
          ],
        })
        .onDuplicateKeyUpdate({ set: { ...sanctionFields, ...hashes } });
    }),
    ...(obsolete.length
      ? [
          client.delete(sanctionTombstone).where(
            and(
              eq(sanctionTombstone.userId, userId),
              inArray(
                sanctionTombstone.sourceSanction,
                obsolete.map((source) => source.sourceSanction),
              ),
            ),
          ),
        ]
      : []),
  ]);
};

/** Unexpired tombstones; registration matches them in memory. */
export const fetchActiveSanctionTombstones = (client: DrizzleClient) =>
  client.query.sanctionTombstone.findMany({
    where: gt(sanctionTombstone.sanctionEndsAt, new Date()),
  });

/**
 * The sanctions a registering account inherits, one per type with the latest end date.
 * Every verified email counts, so moving the old address off primary does not escape it.
 */
export const matchSanctionTombstones = (
  tombstones: SanctionTombstone[],
  userId: string,
  identity: SanctionIdentity | null,
): SanctionMatch[] => {
  const emailHashes = new Set(
    (identity?.emailAddresses ?? [])
      .filter((email) => email.verification?.status === "verified")
      .map((email) =>
        hashSanctionIdentifier("email", normalizeEmail(email.emailAddress)),
      ),
  );
  const accountHashes = new Set(identity ? accountHashesOf(identity) : []);
  const matches = new Map<SanctionTombstoneType, SanctionMatch>();
  for (const tombstone of tombstones) {
    if (tombstone.sanctionEndsAt <= new Date()) continue;
    const matchedBy: SanctionMatch["matchedBy"] = [
      ...(tombstone.userId === userId ? (["clerkId"] as const) : []),
      ...(tombstone.emailHash && emailHashes.has(tombstone.emailHash)
        ? (["email"] as const)
        : []),
      ...(tombstone.accountHashes.some((hash) => accountHashes.has(hash))
        ? (["oauth"] as const)
        : []),
    ];
    if (matchedBy.length === 0) continue;
    const current = matches.get(tombstone.sanction);
    matches.set(tombstone.sanction, {
      sanction: tombstone.sanction,
      endsAt:
        current && current.endsAt > tombstone.sanctionEndsAt
          ? current.endsAt
          : tombstone.sanctionEndsAt,
      reportIds: [...new Set([...(current?.reportIds ?? []), ...tombstone.reportIds])],
      matchedBy: [...new Set([...(current?.matchedBy ?? []), ...matchedBy])],
      tombstones: [...(current?.tombstones ?? []), tombstone],
    });
  }
  // A later deletion references its inherited report. Follow those links back to every
  // source, even when the registering identity no longer matches an ancestor's hashes.
  for (const match of matches.values()) {
    const reportIds = new Set(match.reportIds);
    for (const source of match.tombstones) {
      for (const ancestor of tombstones) {
        if (
          ancestor.sanction !== match.sanction ||
          ancestor.sanctionEndsAt <= new Date() ||
          match.tombstones.includes(ancestor) ||
          !ancestor.carryoverReportIds.some((id) => source.reportIds.includes(id))
        )
          continue;
        match.tombstones.push(ancestor);
        for (const id of ancestor.reportIds) reportIds.add(id);
      }
    }
    match.reportIds = [...reportIds];
  }
  return [...matches.values()];
};

/**
 * Give a new character the matched sanctions through the ordinary moderation records: an
 * activated report with the same type and end date, a decision comment, and an ActionLog
 * entry that links the original reports. The player only sees the report and comment, which
 * say the sanction carried over and nothing about how the account was recognised. The
 * ActionLog table name is not one of the public log types.
 */
export const reapplySanctions = (
  client: DrizzleClient,
  userId: string,
  matches: SanctionMatch[],
) =>
  matches.flatMap((match) => {
    const reportId = nanoid();
    const status = REAPPLIED_STATE[match.sanction];
    return [
      client.insert(userReport).values({
        id: reportId,
        reporterUserId: TERR_BOT_ID,
        reportedUserId: userId,
        system: "sanction_carryover",
        infraction: {},
        reason:
          "This account is subject to a sanction that was still active on a previously deleted account.",
        aiInterpretation: "",
        status,
        adminResolved: true,
        banEnd: match.endsAt,
      }),
      client.insert(userReportComment).values({
        id: nanoid(),
        userId: TERR_BOT_ID,
        reportId,
        content:
          "The remaining sanction from a previously deleted account was re-applied.",
        decision: status,
      }),
      client.insert(actionLog).values({
        id: nanoid(),
        userId,
        tableName: "userReport",
        relatedId: reportId,
        relatedMsg: `Re-applied ${match.sanction.toLowerCase()} from a deleted account`,
        changes: [
          `Sanction: ${match.sanction} until ${match.endsAt.toISOString()}`,
          `Original reports: ${match.reportIds.join(", ")}`,
          `Matched by: ${match.matchedBy.join(", ")}`,
        ],
      }),
      client
        .update(sanctionTombstone)
        .set({
          carryoverReportIds: sql`JSON_ARRAY_APPEND(${sanctionTombstone.carryoverReportIds}, '$', ${reportId})`,
        })
        .where(
          or(
            ...match.tombstones.map((source) =>
              and(
                eq(sanctionTombstone.userId, source.userId),
                eq(sanctionTombstone.sourceSanction, source.sourceSanction),
              ),
            ),
          ),
        ),
    ];
  });

/**
 * Apply a staff decision to linked carryovers and any captured original-report snapshot.
 * Native deletion removes Clerk before game cleanup, so original reports can still be
 * revised while their captured identifiers are the only way to recognise a new account.
 */
export const reviseSanctionTombstones = async (
  client: DrizzleClient,
  reportId: string,
  sanction: SanctionTombstoneType,
  endsAt: Date | null,
  userId: string | null,
) => {
  const [sources, sanctions] = await Promise.all([
    client.query.sanctionTombstone.findMany({
      where: or(
        userId ? eq(sanctionTombstone.userId, userId) : undefined,
        sql`JSON_CONTAINS(${sanctionTombstone.carryoverReportIds}, JSON_QUOTE(${reportId}))`,
      ),
    }),
    userId ? fetchActiveSanctions(client, userId) : Promise.resolve([]),
  ]);
  const originalSources = sources.filter((source) => source.userId === userId);
  // Moderation of an ordinary account must never start retaining its identity.
  const hasOriginalSnapshot = originalSources.some((source) =>
    source.reportIds.includes(reportId),
  );
  const carryoverSources = sources.filter(
    (source) =>
      source.carryoverReportIds.includes(reportId) &&
      (!hasOriginalSnapshot || source.userId !== userId),
  );
  const carryoverWhere = or(
    ...carryoverSources.map((source) =>
      and(
        eq(sanctionTombstone.userId, source.userId),
        eq(sanctionTombstone.sourceSanction, source.sourceSanction),
      ),
    ),
  );
  await Promise.all([
    ...(carryoverSources.length
      ? [
          endsAt
            ? client
                .update(sanctionTombstone)
                .set({ sanction, sanctionEndsAt: endsAt })
                .where(carryoverWhere)
            : client.delete(sanctionTombstone).where(carryoverWhere),
        ]
      : []),
    ...(hasOriginalSnapshot && userId
      ? [
          replaceSanctionSnapshot(
            client,
            userId,
            sanctions,
            originalSources,
            hashesOfSources(originalSources),
          ),
        ]
      : []),
  ]);
};

/** Drop tombstones whose sanction has ended; nothing is kept past the sanction. */
export const removeExpiredSanctionTombstones = (client: DrizzleClient) =>
  client
    .delete(sanctionTombstone)
    .where(lte(sanctionTombstone.sanctionEndsAt, new Date()));
