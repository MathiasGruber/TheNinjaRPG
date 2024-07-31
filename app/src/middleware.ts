import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(
  (auth, request) => {
    if (!isPublicRoute(request)) {
      auth().protect();
    }
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
