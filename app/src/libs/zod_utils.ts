import { zodToJsonSchema } from "openai-zod-to-json-schema";
import { jsonSchema } from "ai";
import type { ZodTypeAny } from "zod";
import type { JSONSchema7 } from "json-schema";

/**
 * Converts a Zod schema to an OpenAI compatible schema.
 * @param input - The Zod schema to convert.
 * @returns The OpenAI compatible schema.
 */
export const convertToOpenaiCompatibleSchema = <T extends ZodTypeAny>(input: T) => {
  const schema = jsonSchema(
    zodToJsonSchema(input, { openaiStrictMode: true }) as JSONSchema7,
  );
  return schema;
};
