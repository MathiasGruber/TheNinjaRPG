import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/manual(.*)",
    "/forum(.*)",
    "/github",
    "/bugs",
    "/terms",
    "/policy",
    "/rules",
    "/login(.*)",
    "/api/trpc/(.*)",
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
    "/(.*?trpc.*?|(?!static|.*\\..*|_next|favicon.ico).*)",
    "/",
  ],
};
