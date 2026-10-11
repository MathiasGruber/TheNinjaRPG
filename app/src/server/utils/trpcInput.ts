/** PIN-bearing inputs must never enter diagnostic messages or error telemetry. */
export const hasSensitiveTrpcInput = (path: string | undefined) =>
  path?.startsWith("parentalControls.") ?? false;

/** Redacts the whole sensitive input so future credential fields are also protected. */
export const diagnosticTrpcInput = (path: string | undefined, input: unknown) =>
  hasSensitiveTrpcInput(path) ? "[REDACTED]" : input;
