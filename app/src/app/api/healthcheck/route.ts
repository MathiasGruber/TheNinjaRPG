import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { drizzleDB } from "@/server/db";

export async function GET() {
  try {
    const user = await drizzleDB.query.userData.findFirst({
      columns: { username: true },
    });
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }
    return Response.json(`OK`);
  } catch (cause) {
    console.error(cause);
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return Response.json(cause, { status: httpCode });
    }
    // Another error occured
    return Response.json("Internal server error", { status: 500 });
  }
}
