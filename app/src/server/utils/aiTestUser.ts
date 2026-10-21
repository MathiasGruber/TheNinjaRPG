import { NextResponse } from "next/server";

/** Returns null when authorized, otherwise a ready-to-return broker error response. */
export const authenticateAiTestUserRequest = (
  request: Request,
  unavailableMessage = "AI test-user broker is only available in preview",
): Response | null => {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, message: unavailableMessage },
      { status: 403 },
    );
  }

  const expectedToken = process.env.AI_TEST_USER_BROKER_TOKEN;
  if (!expectedToken) {
    return NextResponse.json(
      { success: false, message: "AI test-user broker token is not configured" },
      { status: 500 },
    );
  }

  const providedToken = request.headers.get("x-tnr-reviewer-token");
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
};
