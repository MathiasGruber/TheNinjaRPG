import { createHmac } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
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
 * Lowercase, drop a `+tag` and, for Gmail, the dots Gmail ignores, so trivially different
 * spellings of one mailbox hash alike.
 */
export const normalizeEmail = (email: string) => {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0] ?? "";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
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
  return primary
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
  const sanctions = await fetchActiveSanctions(client, userId);
  if (sanctions.length === 0) return;
  const clerkUser =
    identity === undefined ? await fetchSanctionIdentity(userId) : identity;
  const hashes = clerkUser
    ? {
        emailHash: primaryEmailHashOf(clerkUser),
        accountHashes: accountHashesOf(clerkUser),
      }
    : null;
  await Promise.all(
    sanctions.map((entry) => {
      const sanctionFields = {
        sanctionEndsAt: entry.endsAt,
        reportIds: entry.reportIds,
      };
      return client
        .insert(sanctionTombstone)
        .values({
          userId,
          sanction: entry.sanction,
          ...sanctionFields,
          emailHash: hashes?.emailHash ?? null,
          accountHashes: hashes?.accountHashes ?? [],
        })
        .onDuplicateKeyUpdate({ set: { ...sanctionFields, ...(hashes ?? {}) } });
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
    });
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
    ];
  });

/** Drop tombstones whose sanction has ended; nothing is kept past the sanction. */
export const removeExpiredSanctionTombstones = (client: DrizzleClient) =>
  client
    .delete(sanctionTombstone)
    .where(lte(sanctionTombstone.sanctionEndsAt, new Date()));
