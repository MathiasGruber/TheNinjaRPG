import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  debug: false,
  clockSkewInMs: 1000 * 60 * 30,
  publicRoutes: [
    "/",
    "/manual(.*)",
    "/forum(.*)",
    "/github",
    "/help",
    "/rules",
    "/news",
    "/conceptart(.*)",
    "/login(.*)",
    "/api/trpc/(.*)",
    "/api/uploadthing",
  ],
  ignoredRoutes: [
    "/api/cleaner",
    "/api/og",
    "/api/healthcheck",
    "/api/daily",
    "/api/cpaLead",
    "/api/subscriptions",
    "/api/ipn",
  ],
});

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
