import { hasSensitiveTrpcInput } from "@/libs/trpcLogging";

export { hasSensitiveTrpcInput } from "@/libs/trpcLogging";

/** Redacts the whole sensitive input so future credential fields are also protected. */
export const diagnosticTrpcInput = (path: string | undefined, input: unknown) =>
  hasSensitiveTrpcInput(path) ? "[REDACTED]" : input;
