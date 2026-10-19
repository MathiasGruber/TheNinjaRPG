/**
 * Location of the Tower Defense SpacetimeDB module, shared by the browser client
 * (WebSocket) and the server (HTTP SQL reads when verifying claims).
 */
export interface SpacetimeDBConfig {
  host: string;
  moduleName: string;
}

// DEFAULT HOSTS:
// - Local: ws://127.0.0.1:3001
// - SaaS (Testnet/Maincloud): wss://maincloud.spacetimedb.com
export const getSpacetimeDBConfig = (): SpacetimeDBConfig => {
  const isProd = process.env.NODE_ENV === "production";
  const defaultHost = isProd
    ? "wss://maincloud.spacetimedb.com"
    : "ws://127.0.0.1:3001";

  return {
    host: process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? defaultHost,
    moduleName: process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "towerdefense",
  };
};

/** The module's HTTP origin, derived from its WebSocket host. */
export const getSpacetimeDBHttpOrigin = (host: string): string =>
  host.replace(/^ws(s?):\/\//i, "http$1://").replace(/\/+$/, "");
