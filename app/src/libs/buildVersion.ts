/**
 * Deploy skew between a long-lived tab and the server.
 *
 * Tabs, especially suspended mobile tabs, keep running the bundle they loaded for days,
 * while every tRPC response comes from the current deploy. When a deploy adds a value the
 * old bundle cannot represent (a new enum member looked up in a constants table, say),
 * the old bundle crashes on the new data. Each `/api/trpc` response therefore names the
 * build that served it; once that differs from the bundle's own build, the next route
 * change or render crash reloads the page onto the current bundle instead.
 */

/** Commit the running code was built from; `next.config.mjs` inlines it. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "unknown";

/** Response header carrying the server's `BUILD_ID` on `/api/trpc` responses. */
export const BUILD_ID_HEADER = "x-tnr-build";

/**
 * Per-tab record of the server build a reload was last attempted for. If a reload still
 * comes back with the old bundle, the tab is not reloaded again for the same build.
 */
export const BUILD_RELOAD_STORAGE_KEY = "tnr-build-reload";

/** Builds without a commit (local and non-Vercel builds) never count as outdated. */
export const isOutdatedBuild = (
  clientBuild: string,
  serverBuild: string | null | undefined,
): serverBuild is string =>
  !!serverBuild &&
  serverBuild !== "unknown" &&
  clientBuild !== "unknown" &&
  serverBuild !== clientBuild;

/**
 * Record a reload attempt for `serverBuild`, returning false when one was already made
 * in this tab or storage is unavailable, so a stale response can never cause a loop.
 */
export const claimBuildReload = (storage: Storage, serverBuild: string) => {
  try {
    if (storage.getItem(BUILD_RELOAD_STORAGE_KEY) === serverBuild) return false;
    storage.setItem(BUILD_RELOAD_STORAGE_KEY, serverBuild);
    return true;
  } catch {
    return false;
  }
};

let newerServerBuild: string | undefined;

/** Called with the build header of every `/api/trpc` response; absent headers are ignored. */
export const noteServerBuild = (serverBuild: string | null) => {
  if (!serverBuild) return;
  newerServerBuild = isOutdatedBuild(BUILD_ID, serverBuild) ? serverBuild : undefined;
};

/** Reload onto the current bundle when the server is ahead; returns whether it reloads. */
export const reloadIfOutdated = () => {
  if (typeof window === "undefined" || !newerServerBuild) return false;
  let storage: Storage;
  try {
    storage = window.sessionStorage;
  } catch {
    return false;
  }
  if (!claimBuildReload(storage, newerServerBuild)) return false;
  window.location.reload();
  return true;
};
