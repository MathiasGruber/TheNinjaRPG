import { type SQLWrapper, sql } from "drizzle-orm";

/** Resolve NPC or selected player labels inside existing profile reads and aliased tavern joins. */
export const displayTitleSql = (user: {
  isAi: SQLWrapper;
  npcTitle: SQLWrapper;
  activeTitleId: SQLWrapper;
}) =>
  sql<string>`CASE WHEN ${user.isAi} THEN ${user.npcTitle} ELSE COALESCE((SELECT name FROM Title WHERE id = ${user.activeTitleId}), '') END`;
