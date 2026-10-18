import { afterEach, describe, expect, it, vi } from "bun:test";
import * as ai from "ai";
import { OPENAI_REVIEW_MODEL } from "@/drizzle/constants";
import { classifyPetAppearanceImage, validatePetAppearanceQuality } from "@/libs/pets/quality";
import { petAppearanceQualitySchema } from "@/validators/pets";

const accepted = { singleAnimal: true, anatomyCorrect: true, speciesMatches: true, completeBody: true, noGroundOrScene: true, identityPreserved: true, reason: "A complete, clean sprite" };

afterEach(() => vi.restoreAllMocks());

describe("pet visual quality", () => {
  it("rejects extra heads, bad anatomy, ground, wrong species or lost identity", () => {
    for (const field of ["singleAnimal", "anatomyCorrect", "noGroundOrScene", "speciesMatches", "identityPreserved", "completeBody"] as const)
      expect(() => validatePetAppearanceQuality({ ...accepted, [field]: false, reason: `Invalid ${field}` })).toThrow(field);
    expect(() => validatePetAppearanceQuality(accepted)).not.toThrow();
  });

  it("does not call vision after an abort, and observes a caller abort in flight", async () => {
    const model = vi.spyOn(ai, "generateText").mockResolvedValue({ output: accepted } as never);
    await expect(classifyPetAppearanceImage(input(), AbortSignal.abort())).rejects.toThrow();
    expect(model).not.toHaveBeenCalled();
    const controller = new AbortController();
    model.mockImplementation(async (options) => { controller.abort(); expect(options.abortSignal?.aborted).toBe(true); return { output: accepted } as never; });
    await expect(classifyPetAppearanceImage(input(), controller.signal)).rejects.toThrow();
  });

  it("propagates a failed vision request", async () => {
    const error = new Error("Vision unavailable");
    const model = vi.spyOn(ai, "generateText").mockRejectedValue(error);
    await expect(classifyPetAppearanceImage(input(), new AbortController().signal)).rejects.toBe(error);
    expect(model).toHaveBeenCalledTimes(1);
  });

  it("supplies ordered image bytes and labels with a bounded structured vision request", async () => {
    const model = vi.spyOn(ai, "generateText").mockResolvedValue({ output: accepted } as never);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const candidate = input();
    const previous = Buffer.from("previous");
    const controller = new AbortController();
    expect(await classifyPetAppearanceImage({ ...candidate, previousImage: previous }, controller.signal)).toEqual(accepted);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(model).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.objectContaining({ modelId: OPENAI_REVIEW_MODEL }),
      providerOptions: { openai: { reasoningEffort: "none" } },
      maxRetries: 0,
      maxOutputTokens: 500,
      messages: [{ role: "user", content: [
        { type: "text", text: `Requested animal: ${candidate.species}. Identity: ${candidate.identity}. Evolution rank ${candidate.rank} of 10. The first image is PREVIOUS, the last image is CANDIDATE.` },
        ...[previous, candidate.image].map((data) => ({ type: "file", data, mediaType: "image/webp", providerOptions: { openai: { imageDetail: "high" } } })),
      ] }],
    }));
    expect(await model.mock.calls[0]![0].output?.responseFormat).toEqual(await ai.Output.object({ schema: petAppearanceQualitySchema }).responseFormat);
    const signal = model.mock.calls[0]![0].abortSignal;
    expect(signal).not.toBe(controller.signal);
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });
});

const input = () => ({ image: Buffer.from("fixture"), species: "A nimble fox", identity: "Jade green with a star marking", rank: 2 });
