import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  debug: false,
  publicRoutes: [
    "/",
    "/manual(.*)",
    "/forum(.*)",
    "/github",
    "/bugs",
    "/terms",
    "/policy",
    "/rules",
    "/news",
    "/login(.*)",
    "/api/trpc/(.*)",
    "/api/uploadthing",
    "/api/subscriptions",
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
    "/api/uploadthing(.*)",
    "/api/subscriptions(.*)",
  ],
};
