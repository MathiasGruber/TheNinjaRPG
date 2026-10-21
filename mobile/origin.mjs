const PRODUCTION_ORIGIN = "https://www.theninja-rpg.com";

/** @param {string} value */
function parseOrigin(value) {
  const message =
    "TNR_ORIGIN must be a bare HTTPS origin without credentials, wildcards, path, query or fragment";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(message);
  }
  // Check the input too: URL parsing removes dot segments and empty ?/# suffixes.
  if (
    !/^https:\/\/[^/?#\\\s@*]+\/?$/i.test(value) ||
    url.protocol !== "https:" ||
    url.hostname.includes("*") ||
    url.username ||
    url.password
  ) {
    throw new Error(message);
  }
  return url;
}

const url = parseOrigin(process.env.TNR_ORIGIN ?? PRODUCTION_ORIGIN);

export const nativeOrigin = url.origin;
// Only canonical production inherits trust in the verified Clerk Frontend API host.
export const nativeAllowNavigation = [
  url.host,
  ...(nativeOrigin === PRODUCTION_ORIGIN ? ["clerk.theninja-rpg.com"] : []),
];
