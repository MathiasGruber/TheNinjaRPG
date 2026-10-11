import {
  and,
  asc,
  desc,
  eq,
  exists,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import OpenAI from "openai";
import {
  OPENAI_REPORT_EMBEDDING_MODEL,
  REPORT_EMBEDDING_DIMENSIONS,
} from "@/drizzle/constants";
import {
  type UserReport,
  userReport,
  userReportComment,
  userReportEmbedding,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";

const capabilityTtl = 5 * 60 * 1000;
const vectorCapabilities = new WeakMap<
  DrizzleClient,
  { expiresAt: number; supported: Promise<boolean> }
>();
const fulltextUnavailableUntil = new WeakMap<DrizzleClient, number>();

const reportColumns = (client: DrizzleClient) => ({
  id: userReport.id,
  createdAt: userReport.createdAt,
  aiInterpretation: userReport.aiInterpretation,
  reason: userReport.reason,
  infraction: userReport.infraction,
  status: userReport.status,
  system: userReport.system,
  predictedStatus: userReport.predictedStatus,
  // A report contributes one precedent, even when it has several comments.
  comment: sql<string>`(${client
    .select({ content: userReportComment.content })
    .from(userReportComment)
    .where(
      and(
        eq(userReportComment.reportId, userReport.id),
        isNotNull(userReportComment.decision),
      ),
    )
    .orderBy(desc(userReportComment.createdAt), desc(userReportComment.id))
    .limit(1)})`,
});

export type PreviousReport = Pick<
  UserReport,
  | "id"
  | "createdAt"
  | "aiInterpretation"
  | "reason"
  | "infraction"
  | "status"
  | "system"
  | "predictedStatus"
> & { score: number; comment: string };

const eligibleReports = (client: DrizzleClient) =>
  and(
    ne(userReport.aiInterpretation, ""),
    sql`JSON_LENGTH(${userReport.additionalContext}) > 0`,
    ne(userReport.system, "user_profile"),
    ne(userReport.status, "UNVIEWED"),
    exists(
      client
        .select({ id: userReportComment.id })
        .from(userReportComment)
        .where(
          and(
            eq(userReportComment.reportId, userReport.id),
            isNotNull(userReportComment.decision),
          ),
        ),
    ),
  );

/** Cache only explicit feature misses. Outages and permission failures must surface. */
const isFeatureUnavailable = (error: unknown, feature: "vector" | "fulltext") => {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    // Drizzle's wrapper includes query parameters, which are user content and
    // must not be mistaken for the driver's feature diagnostic.
    if (current.cause instanceof Error) {
      current = current.cause;
      continue;
    }
    const sqlMessage = (current as { sqlMessage?: unknown }).sqlMessage;
    const message = typeof sqlMessage === "string" ? sqlMessage : current.message;
    if (feature === "fulltext") {
      if (
        /Can't find FULLTEXT index matching the column list|errno 1191|ER_FT_MATCHING_KEY_NOT_FOUND/i.test(
          message,
        )
      )
        return true;
    } else if (
      /FUNCTION\s+\S*\b(?:DISTANCE|TO_VECTOR)\b.*does not exist/i.test(message) ||
      /(?:unsupported|not supported|not enabled|disabled).*\b(?:vector|distance)\b|\b(?:vector|distance)\b.*(?:unsupported|not supported|not enabled|disabled)/i.test(
        message,
      ) ||
      /(?:Table.*UserReportEmbedding.*doesn't exist|table.*UserReportEmbedding.*not found)/i.test(
        message,
      )
    )
      return true;
    current = current.cause;
  }
  return false;
};

export const supportsReportVectorSearch = async (client: DrizzleClient) => {
  const cached = vectorCapabilities.get(client);
  if (cached && cached.expiresAt > Date.now()) return cached.supported;
  const supported = (async () => {
    try {
      // Probe both the function and optional table before calling the embedding API.
      await client
        .select({
          distance: sql<number>`DISTANCE(TO_VECTOR('[1,0]'), TO_VECTOR('[1,0]'), 'cosine')`,
        })
        .from(userReportEmbedding)
        .limit(1);
      return true;
    } catch (error) {
      if (isFeatureUnavailable(error, "vector")) return false;
      vectorCapabilities.delete(client);
      throw error;
    }
  })();
  vectorCapabilities.set(client, { expiresAt: Date.now() + capabilityTtl, supported });
  return supported;
};

export const generateReportEmbeddings = async (
  texts: string[],
): Promise<number[][]> => {
  const response = await new OpenAI({
    timeout: 10_000,
    maxRetries: 0,
  }).embeddings.create({
    model: OPENAI_REPORT_EMBEDDING_MODEL,
    dimensions: REPORT_EMBEDDING_DIMENSIONS,
    input: texts,
  });
  const embeddings = texts.map(
    (_, index) => response.data.find((row) => row.index === index)?.embedding,
  );
  if (
    embeddings.some(
      (embedding) =>
        !embedding ||
        embedding.length !== REPORT_EMBEDDING_DIMENSIONS ||
        embedding.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error("Invalid moderation report embeddings");
  }
  return embeddings as number[][];
};

type EmbedReports = typeof generateReportEmbeddings;

/** Prefer semantic matches, then full-text ranking, then literal word matches. */
export const getRelatedReports = async (
  client: DrizzleClient,
  aiInterpretation: string,
  options: { excludeReportId?: string; embed?: EmbedReports } = {},
): Promise<PreviousReport[]> => {
  const text = aiInterpretation.trim();
  if (!text) return [];
  const eligible = and(
    eligibleReports(client),
    options.excludeReportId ? ne(userReport.id, options.excludeReportId) : undefined,
  );
  const columns = reportColumns(client);
  const embed = options.embed ?? generateReportEmbeddings;
  if (await supportsReportVectorSearch(client)) {
    // An unavailable embedding provider must not take down report retrieval.
    let embedding: number[] | undefined;
    try {
      [embedding] = await embed([text]);
    } catch (error) {
      console.error(
        "Could not embed moderation report search; using text search",
        error,
      );
    }
    if (embedding) {
      const distance = sql<number>`DISTANCE(${userReportEmbedding.embedding}, TO_VECTOR(${JSON.stringify(embedding)}), 'cosine')`;
      try {
        const reports = await client
          .select({ ...columns, score: sql<number>`1 - ${distance}`.mapWith(Number) })
          .from(userReport)
          .innerJoin(
            userReportEmbedding,
            and(
              eq(userReportEmbedding.reportId, userReport.id),
              eq(userReportEmbedding.sourceText, userReport.aiInterpretation),
              eq(userReportEmbedding.model, OPENAI_REPORT_EMBEDDING_MODEL),
            ),
          )
          .where(eligible)
          .orderBy(asc(distance), desc(userReport.createdAt), asc(userReport.id))
          .limit(10);
        if (reports.length > 0) return reports;
      } catch (error) {
        if (!isFeatureUnavailable(error, "vector")) throw error;
        vectorCapabilities.set(client, {
          expiresAt: Date.now() + capabilityTtl,
          supported: Promise.resolve(false),
        });
      }
    }
  }

  if ((fulltextUnavailableUntil.get(client) ?? 0) <= Date.now()) {
    const score =
      sql<number>`MATCH(${userReport.aiInterpretation}) AGAINST(${text})`.mapWith(
        Number,
      );
    try {
      return await client
        .select({ ...columns, score })
        .from(userReport)
        .where(and(eligible, sql`${score} > 0`))
        .orderBy(desc(score), desc(userReport.createdAt), asc(userReport.id))
        .limit(10);
    } catch (error) {
      if (!isFeatureUnavailable(error, "fulltext")) throw error;
      fulltextUnavailableUntil.set(client, Date.now() + capabilityTtl);
    }
  }

  // Tokenizing strips SQL wildcard characters and avoids requiring an exact summary.
  const words = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((word) => word.length >= 3)
    .slice(0, 25);
  if (words.length === 0) return [];
  const matches = words.map(
    (word) => sql`${userReport.aiInterpretation} LIKE ${`%${word}%`}`,
  );
  const score = sql<number>`(${sql.join(
    matches.map((match) => sql`CASE WHEN ${match} THEN 1 ELSE 0 END`),
    sql` + `,
  )})`.mapWith(Number);
  return client
    .select({ ...columns, score })
    .from(userReport)
    .where(and(eligible, or(...matches)))
    .orderBy(desc(score), desc(userReport.createdAt), asc(userReport.id))
    .limit(10);
};

/** Backfill only resolved precedents; local Community MySQL skips API calls. */
export const indexReportEmbeddings = async (
  client: DrizzleClient,
  embed: EmbedReports = generateReportEmbeddings,
) => {
  if (!(await supportsReportVectorSearch(client))) return;
  const reports = await client
    .select({ id: userReport.id, text: userReport.aiInterpretation })
    .from(userReport)
    .leftJoin(userReportEmbedding, eq(userReportEmbedding.reportId, userReport.id))
    .where(
      and(
        eligibleReports(client),
        or(
          isNull(userReportEmbedding.reportId),
          ne(userReportEmbedding.sourceText, userReport.aiInterpretation),
          ne(userReportEmbedding.model, OPENAI_REPORT_EMBEDDING_MODEL),
        ),
      ),
    )
    .orderBy(asc(userReport.createdAt), asc(userReport.id))
    .limit(50);
  if (reports.length === 0) return;
  const embeddings = await embed(reports.map((report) => report.text));
  await Promise.all(
    reports.map((report, index) => {
      const embedding = sql`TO_VECTOR(${JSON.stringify(embeddings[index])})`;
      return client
        .insert(userReportEmbedding)
        .values({
          reportId: report.id,
          sourceText: report.text,
          model: OPENAI_REPORT_EMBEDDING_MODEL,
          embedding,
        })
        .onDuplicateKeyUpdate({
          set: {
            sourceText: report.text,
            model: OPENAI_REPORT_EMBEDDING_MODEL,
            embedding,
          },
        });
    }),
  );
};
