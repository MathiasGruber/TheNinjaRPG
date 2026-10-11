import { afterEach, describe, expect, it, vi } from "bun:test";
import * as ai from "ai";
import sharp from "sharp";
import { OPENAI_MODERATION_MODEL } from "@/drizzle/constants";
import { classifyPetAppearanceImage, validatePetAppearanceQuality } from "@/libs/pets/quality";

const accepted = { singleAnimal: true, anatomyCorrect: true, speciesMatches: true, completeBody: true, noGroundOrScene: true, identityPreserved: true, reason: "A complete, clean sprite" };

afterEach(() => vi.restoreAllMocks());

describe("pet visual quality", () => {
  it("rejects extra heads, bad anatomy, ground, wrong species or lost identity", () => {
    for (const field of ["singleAnimal", "anatomyCorrect", "noGroundOrScene", "speciesMatches", "identityPreserved", "completeBody"] as const)
      expect(() => validatePetAppearanceQuality({ ...accepted, [field]: false, reason: `Invalid ${field}` })).toThrow(field);
    expect(() => validatePetAppearanceQuality(accepted)).not.toThrow();
  });

  it("fails closed for a partial or missing structured verdict", async () => {
    const model = vi.spyOn(ai, "generateText");
    model.mockResolvedValue({ output: { singleAnimal: true } } as never);
    await expect(classifyPetAppearanceImage(input(), new AbortController().signal)).rejects.toThrow();
    model.mockResolvedValue({ output: undefined } as never);
    await expect(classifyPetAppearanceImage(input(), new AbortController().signal)).rejects.toThrow();
  });

  it("does not call vision after an abort, and observes a caller abort in flight", async () => {
    const model = vi.spyOn(ai, "generateText").mockResolvedValue({ output: accepted } as never);
    await expect(classifyPetAppearanceImage(input(), AbortSignal.abort())).rejects.toThrow();
    expect(model).not.toHaveBeenCalled();
    const controller = new AbortController();
    model.mockImplementation(async (options) => { controller.abort(); expect(options.abortSignal?.aborted).toBe(true); return { output: accepted } as never; });
    await expect(classifyPetAppearanceImage(input(), controller.signal)).rejects.toThrow();
  });

  it("does not retry a failed vision request", async () => {
    const transport = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "Vision unavailable" } }), { status: 500, headers: { "content-type": "application/json" } }));
    await expect(classifyPetAppearanceImage(input(), new AbortController().signal)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("transports two decoded image buffers with labels and a bounded structured vision request", async () => {
    const candidate = await sharp({ create: { width: 64, height: 64, channels: 4, background: "red" } }).webp().toBuffer();
    const previous = await sharp({ create: { width: 64, height: 64, channels: 4, background: "green" } }).webp().toBuffer();
    let body: Record<string, unknown> | undefined;
    let transportSignal: AbortSignal | undefined;
    const transport = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      body = JSON.parse(String(options?.body)) as Record<string, unknown>;
      transportSignal = options?.signal ?? undefined;
      return new Response(JSON.stringify({ id: "quality-fixture", object: "chat.completion", created: 0, model: OPENAI_MODERATION_MODEL, choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(accepted) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { "content-type": "application/json" } });
    });
    const controller = new AbortController();
    expect(await classifyPetAppearanceImage({ ...input(), image: candidate, previousImage: previous }, controller.signal)).toEqual(accepted);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(body?.model).toBe(OPENAI_MODERATION_MODEL);
    expect(body?.response_format).toEqual(expect.objectContaining({ type: "json_schema" }));
    const messages = body?.messages as { content: string | { type: string; text?: string; image_url?: { url: string; detail: string } }[] }[];
    const parts = messages[1]?.content;
    if (!Array.isArray(parts)) throw new Error("Expected image content parts");
    expect(parts[0]?.text).toContain("first image is PREVIOUS");
    expect(parts[0]?.text).toContain("last image is CANDIDATE");
    const images = parts.filter((part) => part.type === "image_url");
    expect(images).toHaveLength(2);
    expect(images.map((part) => Buffer.from(part.image_url!.url.split(",")[1]!, "base64"))).toEqual([previous, candidate]);
    expect(images.every((part) => part.image_url?.detail === "high")).toBe(true);
    expect(transportSignal).toBeDefined();
    controller.abort();
    expect(transportSignal?.aborted).toBe(true);
  });
});

const input = () => ({ image: Buffer.from("fixture"), species: "A nimble fox", identity: "Jade green with a star marking", rank: 2 });
