/** PIN-bearing inputs must never enter diagnostic messages or error telemetry. */
export const hasSensitiveTrpcInput = (path: string | undefined) =>
  path?.startsWith("parentalControls.") ?? false;

export const diagnosticTrpcInput = (path: string | undefined, input: unknown) =>
  hasSensitiveTrpcInput(path) ? "[REDACTED]" : input;
