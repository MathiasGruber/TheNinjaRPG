import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  debug: false,
  publicRoutes: [
    "/",
    "/manual(.*)",
    "/forum(.*)",
    "/github",
    "/help",
    "/terms",
    "/policy",
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
