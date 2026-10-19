/** Suppress entire operations because both inputs and responses can contain credentials. */
export const hasSensitiveTrpcInput = (path: string | undefined) =>
  Boolean(
    path?.startsWith("merch.") ||
      path?.startsWith("parentalControls.") ||
      path?.startsWith("nativeAuth."),
  );

export const shouldLogTrpcOperation = (
  operation: { path?: string; direction: "up" | "down"; result?: unknown },
  development = process.env.NODE_ENV === "development",
) =>
  !hasSensitiveTrpcInput(operation.path) &&
  (development ||
    (operation.direction === "down" && operation.result instanceof Error));
