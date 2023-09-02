import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  debug: true,
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
    "/api/uploadthing",
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
  ],
};
