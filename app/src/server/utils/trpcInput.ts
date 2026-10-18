/** Authentication proofs and PINs must never enter diagnostics or error telemetry. */
export const hasSensitiveTrpcInput = (path: string | undefined) =>
  Boolean(path?.startsWith("parentalControls.") || path?.startsWith("nativeAuth."));

/** Redacts the whole sensitive input so future credential fields are also protected. */
export const diagnosticTrpcInput = (path: string | undefined, input: unknown) =>
  hasSensitiveTrpcInput(path) ? "[REDACTED]" : input;
