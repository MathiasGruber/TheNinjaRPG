import {
  type Cast,
  Client,
  type Config,
  type Transaction,
} from "@planetscale/database";
import { format, type SqlValue } from "sql-escaper";

/** Keep Drizzle's parameterized calls at the boundary to the SQL-only HTTP driver. */
export const createPlanetScaleClient = (config: Config) => {
  const client = new Client(config);
  const transaction = client.transaction.bind(client);
  bindParameters(client);
  client.transaction = <T>(callback: (tx: Transaction) => Promise<T>) =>
    transaction((tx) => callback(bindParameters(tx)));
  return client;
};

// Drizzle's stable PlanetScale adapter still passes (sql, params, options). Adapt
// only these client instances; the driver's own BEGIN/COMMIT/ROLLBACK use (sql, options).
const bindParameters = <T extends Pick<Client, "execute">>(client: T) => {
  const execute = client.execute.bind(client);
  return Object.assign(client, {
    execute: (
      query: string,
      paramsOrOptions?: SqlValue[] | ExecuteOptions,
      options?: ExecuteOptions,
    ) => {
      const hasParameters = Array.isArray(paramsOrOptions);
      const statement = hasParameters
        ? format(query, paramsOrOptions, true, "Z")
        : query;
      const settings = hasParameters ? options : paramsOrOptions;
      return settings?.as === "array"
        ? execute(statement, { ...settings, as: "array" })
        : execute(statement, { ...settings, as: "object" });
    },
  });
};

type ExecuteOptions = { as?: "array" | "object"; cast?: Cast };
