import { createHmac } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/**
 * Sanction tombstones let a banned or silenced player delete their account (GDPR Art. 17,
 * App Store and Google Play account-deletion rules) without escaping the sanction by
 * registering again.
 *
 * Deleting an account while a ban or silence still runs stores one row per active report:
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

const REAPPLIED_STATE: Record<SanctionTombstoneType, BanState> = {
  BAN: "BAN_ACTIVATED",
  SILENCE: "SILENCE_ACTIVATED",
};

export const SANCTION_SOURCE_CHANGED = Symbol("sanctionSourceChanged");

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

/** Current bans and silences, including timeouts, at both preflight and persistence. */
const activeSanctionReportsWhere = (userId: string) =>
  and(
    eq(userReport.reportedUserId, userId),
    inArray(userReport.status, [
      "BAN_ACTIVATED",
      "SILENCE_ACTIVATED",
      "TIMEOUT_ACTIVATED",
    ]),
    gt(userReport.banEnd, new Date()),
  );

/**
 * Store a tombstone for every sanction still running on this account. Call it before the
 * account's reports or its Clerk user are removed.
 *
 * Pass the Clerk user when the caller already holds it; otherwise it is loaded, and only
 * when a sanction exists. The write selects current decisions after the Clerk lookup.
 * Repeated captures preserve case links. Once Clerk is gone, keep the captured snapshot:
 * moderation updates it through reviseSanctionTombstones, and the original reports may now
 * be stale. Repeating cleanup after the reports are gone also leaves the snapshot untouched.
 */
export const recordSanctionTombstone = async (
  client: DrizzleClient,
  userId: string,
  identity?: SanctionIdentity | null,
) => {
  const activeReport = await client.query.userReport.findFirst({
    columns: { id: true },
    where: activeSanctionReportsWhere(userId),
  });
  if (!activeReport) return;
  const clerkUser =
    identity === undefined ? await fetchSanctionIdentity(userId) : identity;
  if (!clerkUser) return;
  const hashes = {
    emailHash: primaryEmailHashOf(clerkUser),
    accountHashes: accountHashesOf(clerkUser),
  };
  const sanction = sql<SanctionTombstoneType>`CASE WHEN ${userReport.status} = 'BAN_ACTIVATED' THEN 'BAN' ELSE 'SILENCE' END`;
  // Select eligibility and the decision in the same write, so a completed staff revision
  // cannot be replaced by a snapshot from before the Clerk lookup.
  await retryOnDeadlock(() =>
    client
      .insert(sanctionTombstone)
      .select(
        client
          .select({
            userId: sql`${userId}`.as("userId"),
            sourceId: userReport.id,
            sanction: sanction.as("sanction"),
            sanctionEndsAt: userReport.banEnd,
            // INSERT SELECT bypasses column encoders; produce SQL JSON for both arrays.
            reportIds: sql`JSON_ARRAY(${userReport.id})`.as("reportIds"),
            emailHash: sql`${hashes.emailHash}`.as("emailHash"),
            accountHashes:
              sql`CAST(${JSON.stringify(hashes.accountHashes)} AS JSON)`.as(
                "accountHashes",
              ),
            carryoverReportIds: sql`JSON_ARRAY()`.as("carryoverReportIds"),
            createdAt: sql`CURRENT_TIMESTAMP(3)`.as("createdAt"),
          })
          .from(userReport)
          .where(activeSanctionReportsWhere(userId)),
      )
      .onDuplicateKeyUpdate({
        set: { sanction, sanctionEndsAt: sql`${userReport.banEnd}`, ...hashes },
      }),
  );
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
      // Claim the same active decisions and identifiers that supported the match. A
      // mismatch aborts the registration transaction, including every report and link.
      // Other registrations may append links without changing this source's authority.
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
                eq(sanctionTombstone.sourceId, source.sourceId),
                eq(sanctionTombstone.sanction, source.sanction),
                eq(sanctionTombstone.sanctionEndsAt, source.sanctionEndsAt),
                gt(sanctionTombstone.sanctionEndsAt, new Date()),
                source.emailHash
                  ? eq(sanctionTombstone.emailHash, source.emailHash)
                  : isNull(sanctionTombstone.emailHash),
                sql`${sanctionTombstone.accountHashes} = CAST(${JSON.stringify(source.accountHashes)} AS JSON)`,
              ),
            ),
          ),
        )
        .then((result) => {
          if (result.rowsAffected !== match.tombstones.length) {
            throw SANCTION_SOURCE_CHANGED;
          }
        }),
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
  // Each original case retains its own current decision. Rebuilding from the deleted
  // account's other reports would overwrite decisions made on their linked carryovers.
  // Only existing sources are revised, so ordinary moderation never retains an identity.
  const where = or(
    userId
      ? and(
          eq(sanctionTombstone.userId, userId),
          eq(sanctionTombstone.sourceId, reportId),
        )
      : undefined,
    sql`JSON_CONTAINS(${sanctionTombstone.carryoverReportIds}, JSON_QUOTE(${reportId}))`,
  );
  await (endsAt
    ? client
        .update(sanctionTombstone)
        .set({ sanction, sanctionEndsAt: endsAt })
        .where(where)
    : client.delete(sanctionTombstone).where(where));
};

/** Drop tombstones whose sanction has ended; nothing is kept past the sanction. */
export const removeExpiredSanctionTombstones = (client: DrizzleClient) =>
  client
    .delete(sanctionTombstone)
    .where(lte(sanctionTombstone.sanctionEndsAt, new Date()));
