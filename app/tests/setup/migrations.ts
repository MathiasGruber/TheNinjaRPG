/** Reconstructs a pre-migration table from its snapshot for isolated migration validation. */
export const baselineTableSql = (table: SnapshotTable) => {
  const definitions = Object.values(table.columns).map(
    (column) =>
      `${quoteIdentifier(column.name)} ${column.type}${column.generated ? ` GENERATED ALWAYS AS (${column.generated.as}) ${column.generated.type.toUpperCase()}` : ""}${column.notNull ? " NOT NULL" : ""}${column.default !== undefined ? ` DEFAULT ${String(column.default).replaceAll("\\'", "'")}` : ""}`,
  );
  for (const key of Object.values(table.compositePrimaryKeys)) {
    definitions.push(`PRIMARY KEY (${key.columns.map(quoteIdentifier).join(", ")})`);
  }
  for (const index of Object.values(table.indexes).filter((index) => index.isUnique)) {
    definitions.push(
      `UNIQUE KEY ${quoteIdentifier(index.name)} (${index.columns.map(quoteIdentifier).join(", ")})`,
    );
  }
  for (const constraint of Object.values(table.uniqueConstraints ?? {})) {
    definitions.push(
      `UNIQUE KEY ${quoteIdentifier(constraint.name)} (${constraint.columns.map(quoteIdentifier).join(", ")})`,
    );
  }
  return `CREATE TABLE ${quoteIdentifier(table.name)} (${definitions.join(", ")})`;
};

/** Quote a MySQL fixture identifier, including any embedded backticks. */
export const quoteIdentifier = (name: string) => `\`${name.replaceAll("`", "``")}\``;

export type SnapshotTable = {
  name: string;
  columns: Record<
    string,
    {
      name: string;
      type: string;
      notNull: boolean;
      default?: unknown;
      generated?: { as: string; type: "stored" | "virtual" };
    }
  >;
  compositePrimaryKeys: Record<string, { columns: string[] }>;
  indexes: Record<string, { name: string; columns: string[]; isUnique: boolean }>;
  uniqueConstraints?: Record<string, { name: string; columns: string[] }>;
};
