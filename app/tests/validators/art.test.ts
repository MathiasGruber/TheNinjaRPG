import { describe, expect, it } from "bun:test";
import { conceptArtPromptSchema, conceptVideoPromptSchema } from "@/validators/art";

describe.each([
  ["image", conceptArtPromptSchema],
  ["video", conceptVideoPromptSchema],
] as const)("%s generation input", (_type, schema) => {
  it("accepts the database prompt and seed limits", () => {
    expect(schema.safeParse({ prompt: "a".repeat(5000), seed: 2147483647 }).success).toBe(true);
  });

  it("rejects prompts and seeds outside the database limits", () => {
    expect(schema.safeParse({ prompt: "a".repeat(5001) }).success).toBe(false);
    for (const seed of [-1, 0.5, 2147483648, 4294967295]) {
      expect(schema.safeParse({ prompt: "A ninja", seed }).success).toBe(false);
    }
  });
});

it("bounds video negative prompts and preserves the optional default", () => {
  expect(conceptVideoPromptSchema.parse({ prompt: "A ninja" }).negative_prompt).toBe("");
  expect(conceptVideoPromptSchema.safeParse({ prompt: "A ninja", negative_prompt: "a".repeat(5000) }).success).toBe(true);
  expect(conceptVideoPromptSchema.safeParse({ prompt: "A ninja", negative_prompt: "a".repeat(5001) }).success).toBe(false);
});
