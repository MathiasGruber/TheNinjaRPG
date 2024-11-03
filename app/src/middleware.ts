import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
// import type { NextRequest } from "next/server";
// import * as UAParser from "ua-parser-js";

const isPublicRoute = createRouteMatcher([
  "/(.*)",
  "/api/cleaner",
  "/api/daily",
  "/api/healthcheck",
  "/api/ipn",
  "/api/og",
  "/api/subscriptions",
  "/api/trpc/(.*)",
  "/api/uploadthing",
  "/conceptart(.*)",
  "/forum(.*)",
  "/github",
  "/help",
  "/login(.*)",
  "/manual(.*)",
  "/news",
  "/rules",
]);

// export function uaMiddleware(request: NextRequest) {
//   const userAgent = request.headers.get("user-agent") || undefined;
//   const userAgentParsed = new UAParser.UAParser(userAgent);
//   if (userAgentParsed.getBrowser().name === undefined) {
//     return NextResponse.json(
//       { message: "Forbidden. Only access through browser" },
//       { status: 403 },
//     );
//   }
//   return NextResponse.next();
// }

/**
 * Optimize requests, see: https://web.dev/articles/preconnect-and-dns-prefetch#resolve-domain-name-early-with-reldns-prefetch
 * @param request
 * @returns
 */
export function dnsPrefetchingMiddleware() {
  const response = NextResponse.next();
  response.headers.append(
    "Link",
    "<https://o4507797256601600.ingest.de.sentry.io>; rel=dns-prefetch",
  );
  response.headers.append(
    "Link",
    "<https://consentcdn.cookiebot.com>; rel=dns-prefetch",
  );
  return response;
}

export default clerkMiddleware(
  async (auth, request) => {
    // Protect all routes except for the public ones
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
    // Optimize prefetching
    dnsPrefetchingMiddleware();
    // Ensure valid user agent
    // return uaMiddleware(request);
  },
  { clockSkewInMs: 1000 * 60 * 30 },
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next
     * - static (static files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/(.*?trpc.*?|.*?api.*?|(?!static|.*\\..*|_next|favicon.ico).*)",
    "/",
  ],
};
