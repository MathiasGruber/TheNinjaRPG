import { type SQLWrapper, sql } from "drizzle-orm";

/** One scalar projection works for relational reads and aliased tavern joins without extra queries. */
export const displayTitleSql = (user: {
  isAi: SQLWrapper;
  npcTitle: SQLWrapper;
  activeTitleId: SQLWrapper;
}) =>
  sql<string>`CASE WHEN ${user.isAi} THEN ${user.npcTitle} ELSE COALESCE((SELECT name FROM Title WHERE id = ${user.activeTitleId}), '') END`;
