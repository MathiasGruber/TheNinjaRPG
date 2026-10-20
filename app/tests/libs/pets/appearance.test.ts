import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as Sentry from "@sentry/nextjs";
import sharp from "sharp";
import { Moderations } from "openai/resources/moderations";
import * as moderator from "@/libs/moderator";
import { PIXEL_ART_RENDERING } from "@/libs/imagePrompts";
import { downloadPetImage, generatePetAppearance } from "@/libs/pets/appearance";
import { PET_AURAS, PET_CHARACTERISTICS, PET_PALETTES } from "@/libs/pets/catalogue";
import * as quality from "@/libs/pets/quality";
import * as replicate from "@/libs/replicate";
import { initialPetSpecies } from "./helpers/species";

const sourceUrl = "https://example.com/source-pet.webp";
const avatarUrl = "https://example.com/accepted-pet.webp";
const correctedUrl = "https://example.com/corrected-pet.webp";
const normalizedUrl = "https://example.com/normalized-pet.webp";
const pet = { userId: "pet-owner", speciesId: "pet-species-0", species: initialPetSpecies[0]!, paletteIndex: 0, characteristicIndex: 0, auraIndex: 0, rank: 1, artRank: 0, avatar: null };
const acceptedQuality = { singleAnimal: true, anatomyCorrect: true, speciesMatches: true, completeBody: true, noGroundOrScene: true, identityPreserved: true, evolutionStronger: true, avatarFacing: "left" as const, reason: "A valid pet sprite" };

beforeEach(() => vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue(acceptedQuality));
afterEach(() => vi.restoreAllMocks());

describe("companion provider pipeline", () => {
  it("keeps a verified left-facing founder without another upload", async () => {
    const upload = vi.spyOn(replicate, "uploadFileFromReplicate");
    const buffer = await cutout();
    const provider = stubFounder(buffer);
    const legacyProvider = vi.spyOn(replicate, "fastTxt2imgReplicate");
    const uploads: string[] = [];
    expect(await generatePetAppearance(pet, async (url) => { uploads.push(url); })).toEqual({ avatar: avatarUrl, avatarFacing: "left" });
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ previousImg: undefined, removeBg: true, backgroundRemovalModel: "851-labs", width: 512, height: 512, size: "square", preprompt: expect.stringContaining(PIXEL_ART_RENDERING) }));
    expect(moderator.classifyNsfwImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/), true, expect.any(AbortSignal));
    expect(moderator.classifyNsfwImage).toHaveBeenCalledTimes(1);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledTimes(1);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledWith(expect.objectContaining({ species: pet.species.name }), expect.any(AbortSignal));
    expect(provider).toHaveBeenCalledTimes(1);
    expect(legacyProvider).not.toHaveBeenCalled();
    expect(uploads).toEqual([avatarUrl]);
    expect(upload).not.toHaveBeenCalled();
  });

  it("mirrors every accepted right-facing pixel without another model call and tracks the normalized upload", async () => {
    const buffer = await cutout();
    const original = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const provider = stubFounder(buffer);
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, avatarFacing: "right" });
    const upload = vi.spyOn(replicate, "uploadFileFromReplicate").mockResolvedValue({ data: { ufsUrl: normalizedUrl }, error: null } as never);
    const owned: string[] = [];
    const controller = new AbortController();
    expect(await generatePetAppearance(pet, async (url) => { owned.push(url); }, controller.signal)).toEqual({ avatar: normalizedUrl, avatarFacing: "left" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith("pet", expect.any(Blob), "webp", controller.signal);
    const mirrored = Buffer.from(await upload.mock.calls[0]![1].arrayBuffer());
    expect(await sharp(mirrored).metadata()).toMatchObject({ format: "webp", width: original.info.width, height: original.info.height, hasAlpha: true });
    const expected = Buffer.alloc(original.data.length);
    for (let y = 0; y < original.info.height; y++) for (let x = 0; x < original.info.width; x++) {
      const source = (y * original.info.width + original.info.width - 1 - x) * 4;
      expected.set(original.data.subarray(source, source + 4), (y * original.info.width + x) * 4);
    }
    const pixels = await sharp(mirrored).ensureAlpha().raw().toBuffer();
    expect(pixels).toEqual(expected);
    expect(pixels).not.toEqual(original.data);
    expect(owned).toEqual([avatarUrl, normalizedUrl]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledTimes(1);
    expect(moderator.classifyNsfwImage).toHaveBeenCalledTimes(1);
  });

  it.each(["upload", "tracking"] as const)("does not accept a normalized image after %s fails", async (stage) => {
    const provider = stubFounder(await cutout());
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, avatarFacing: "right" });
    const upload = vi.spyOn(replicate, "uploadFileFromReplicate").mockResolvedValue({ data: { ufsUrl: normalizedUrl }, error: null } as never);
    if (stage === "upload") upload.mockResolvedValue({ data: null, error: { message: "Storage unavailable" } } as never);
    const owned: string[] = [];
    await expect(generatePetAppearance(pet, async (url) => {
      owned.push(url);
      if (url === normalizedUrl) throw new Error("Upload tracking failed");
    })).rejects.toThrow(stage === "upload" ? "Could not upload" : "Upload tracking failed");
    expect(owned).toEqual(stage === "upload" ? [avatarUrl] : [avatarUrl, normalizedUrl]);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("tracks a completed normalization upload before observing a cancellation", async () => {
    stubFounder(await cutout());
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, avatarFacing: "right" });
    const controller = new AbortController();
    vi.spyOn(replicate, "uploadFileFromReplicate").mockImplementation(async () => {
      controller.abort(new Error("Generation deadline reached"));
      return { data: { ufsUrl: normalizedUrl }, error: null } as never;
    });
    const owned: string[] = [];
    await expect(generatePetAppearance(pet, async (url) => { owned.push(url); }, controller.signal)).rejects.toThrow("Generation deadline reached");
    expect(owned).toEqual([avatarUrl, normalizedUrl]);
  });

  it("does not upload a normalized image after the generation deadline expires during review", async () => {
    stubFounder(await cutout());
    const upload = vi.spyOn(replicate, "uploadFileFromReplicate");
    const controller = new AbortController();
    vi.spyOn(quality, "classifyPetAppearanceImage").mockImplementation(async () => {
      controller.abort(new Error("Generation deadline reached"));
      return { ...acceptedQuality, avatarFacing: "right" };
    });
    await expect(generatePetAppearance(pet, async () => {}, controller.signal)).rejects.toThrow("Generation deadline reached");
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not accept or correct a candidate that fails moderation", async () => {
    const provider = stubFounder(await cutout());
    vi.spyOn(moderator, "classifyNsfwImage").mockResolvedValue({ isNsfw: true, reason: "Unsafe source" });
    const owned: string[] = [];
    await expect(generatePetAppearance(pet, async (url) => { owned.push(url); })).rejects.toThrow("content review");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(quality.classifyPetAppearanceImage).not.toHaveBeenCalled();
    expect(owned).toEqual([avatarUrl]);
  });

  it("rejects an opaque background instead of saving a broken combat sprite", async () => {
    const opaque = await sharp({ create: { width: 128, height: 128, channels: 3, background: "white" } }).webp().toBuffer();
    const provider = stubFounder(opaque);
    await expect(generatePetAppearance(pet, async () => {})).rejects.toThrow("transparent background");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(quality.classifyPetAppearanceImage).not.toHaveBeenCalled();
  });

  it("sends an opaque neutral evolution reference while preserving its pixels, gaps and alpha review evidence", async () => {
    const previous = await cutout();
    const buffer = await cutout(80);
    vi.spyOn(moderator, "classifyNsfwImage").mockResolvedValue({ isNsfw: false, reason: "Safe" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(new Blob([(String(url) === sourceUrl ? previous : buffer) as BlobPart])));
    const edit = vi.spyOn(replicate, "txt2imgNanoBanana").mockResolvedValue([avatarUrl]);
    const founder = vi.spyOn(replicate, "fastTxt2imgReplicate");
    expect(await generatePetAppearance({ ...pet, rank: 2, artRank: 1, avatar: sourceUrl }, async () => {})).toEqual({ avatar: avatarUrl, avatarFacing: "left" });
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ removeBg: true, prompt: expect.stringContaining("SAME individual animal") }));
    await expectOpaqueReference(edit.mock.calls[0]![0].previousImg, previous);
    expect(founder).not.toHaveBeenCalled();
    expect(moderator.classifyNsfwImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/), true, expect.any(AbortSignal));
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledWith(expect.objectContaining({ image: buffer, previousImage: previous, rank: 2, previousRank: 1 }), expect.any(AbortSignal));
  });

  it("passes a same-rank redraw to review without treating it as another evolution", async () => {
    const buffer = await cutout();
    const edit = stubFounder(buffer);
    await generatePetAppearance({ ...pet, rank: 4, artRank: 4, avatar: sourceUrl }, async () => {});
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledWith(expect.objectContaining({ rank: 4, previousRank: 4, previousImage: buffer }), expect.any(AbortSignal));
    expect(edit.mock.calls[0]![0].prompt).toContain("Do not evolve");
    await expectOpaqueReference(edit.mock.calls[0]![0].previousImg, buffer);
  });

  it("redraws a founder's wrong species anatomy once while keeping its traits and all checks", async () => {
    const species = initialPetSpecies.find((entry) => entry.name === "Crow")!;
    const crow = { ...pet, species, speciesId: species.id,
      paletteIndex: PET_PALETTES.find((entry) => entry.name === "Honey")!.index,
      characteristicIndex: PET_CHARACTERISTICS.find((entry) => entry.name === "Bright eyes")!.index,
      auraIndex: PET_AURAS.find((entry) => entry.name === "Lightning")!.index,
    };
    const buffer = await cutout();
    const edit = stubFounder(buffer).mockResolvedValueOnce([avatarUrl]).mockResolvedValueOnce([correctedUrl]);
    const review = vi.spyOn(quality, "classifyPetAppearanceImage")
      .mockResolvedValueOnce({ ...acceptedQuality, speciesMatches: false, reason: "A baby chick instead of the requested crow" })
      .mockResolvedValueOnce({ ...acceptedQuality, avatarFacing: "right" });
    vi.spyOn(replicate, "uploadFileFromReplicate").mockResolvedValue({ data: { ufsUrl: normalizedUrl }, error: null } as never);
    const controller = new AbortController();
    const owned: string[] = [];
    expect(await generatePetAppearance(crow, async (url) => { owned.push(url); }, controller.signal)).toEqual({ avatar: normalizedUrl, avatarFacing: "left" });
    expect(edit).toHaveBeenCalledTimes(2);
    expect(edit.mock.calls[1]![0]).toEqual(expect.objectContaining({
      removeBg: true, signal: controller.signal,
      prompt: expect.stringContaining("A baby chick instead of the requested crow"),
    }));
    expect(edit.mock.calls[1]![0].prompt).toContain(crow.species.description);
    expect(edit.mock.calls[1]![0].prompt).toContain("Evolution rank 1 of 10");
    await expectOpaqueReference(edit.mock.calls[1]![0].previousImg, buffer);
    for (const trait of [PET_PALETTES[crow.paletteIndex]!, PET_CHARACTERISTICS[crow.characteristicIndex]!, PET_AURAS[crow.auraIndex]!])
      expect(edit.mock.calls[1]![0].prompt).toContain(trait.description);
    expect(review).toHaveBeenCalledTimes(2);
    expect(review.mock.calls[1]![0]).toMatchObject({ image: buffer, species: crow.species.name, rank: 1 });
    expect(review.mock.calls[1]![1]).toBe(controller.signal);
    expect(moderator.classifyNsfwImage).toHaveBeenCalledTimes(2);
    expect(owned).toEqual([avatarUrl, correctedUrl, normalizedUrl]);
  });

  it("rejects a malformed founder after exactly one failed correction and tracks its uploads", async () => {
    const edit = stubFounder(await cutout()).mockResolvedValueOnce([avatarUrl]).mockResolvedValueOnce([correctedUrl]);
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, singleAnimal: false, reason: "Two heads on one animal" });
    const owned: string[] = [];
    await expect(generatePetAppearance(pet, async (url) => { owned.push(url); })).rejects.toThrow("Two heads");
    expect(edit).toHaveBeenCalledTimes(2);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledTimes(2);
    expect(owned).toEqual([avatarUrl, correctedUrl]);
  });

  it.each(["unsafe", "opaque"] as const)("does not accept an %s correction", async (failure) => {
    const buffer = await cutout();
    const edit = stubFounder(buffer).mockResolvedValueOnce([avatarUrl]).mockResolvedValueOnce([correctedUrl]);
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValueOnce({ ...acceptedQuality, singleAnimal: false, reason: "Two heads on one animal" });
    if (failure === "unsafe") {
      vi.spyOn(moderator, "classifyNsfwImage")
        .mockResolvedValueOnce({ isNsfw: false, reason: "Safe cutout" })
        .mockResolvedValueOnce({ isNsfw: true, reason: "Unsafe correction" });
    } else {
      const opaque = await sharp({ create: { width: 128, height: 128, channels: 3, background: "white" } }).webp().toBuffer();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(new Blob([(String(url) === correctedUrl ? opaque : buffer) as BlobPart])));
    }
    const owned: string[] = [];
    await expect(generatePetAppearance(pet, async (url) => { owned.push(url); })).rejects.toThrow(failure === "unsafe" ? "content review" : "transparent background");
    expect(edit).toHaveBeenCalledTimes(2);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledTimes(1);
    expect(owned).toEqual([avatarUrl, correctedUrl]);
  });

  it.each(["provider", "vision"] as const)("does not start a correction after a %s failure", async (stage) => {
    const provider = stubFounder(await cutout());
    const error = new Error(`${stage} unavailable`);
    if (stage === "provider") provider.mockRejectedValue(error);
    else vi.spyOn(quality, "classifyPetAppearanceImage").mockRejectedValue(error);
    await expect(generatePetAppearance(pet, async () => {})).rejects.toBe(error);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("does not start a correction after the generation deadline expires during review", async () => {
    const provider = stubFounder(await cutout());
    const controller = new AbortController();
    vi.spyOn(quality, "classifyPetAppearanceImage").mockImplementation(async () => {
      controller.abort(new DOMException("Generation deadline reached", "TimeoutError"));
      return { ...acceptedQuality, singleAnimal: false, reason: "Two heads on one animal" };
    });
    await expect(generatePetAppearance(pet, async () => {}, controller.signal)).rejects.toThrow("Generation deadline reached");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it.each([
    { check: "noGroundOrScene", reason: "A ground patch below the feet" },
    { check: "evolutionStronger", reason: "Only the edge glow changed; the animal does not look stronger" },
  ] as const)("repairs a rejected evolution's $check once from its accepted reference", async ({ check, reason }) => {
    const previous = { ...pet, rank: 2, artRank: 1, avatar: sourceUrl };
    vi.spyOn(moderator, "classifyNsfwImage").mockResolvedValue({ isNsfw: false, reason: "Safe" });
    const reference = await cutout();
    const buffer = await cutout(80);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(new Blob([(String(url) === sourceUrl ? reference : buffer) as BlobPart])));
    const edit = vi.spyOn(replicate, "txt2imgNanoBanana").mockResolvedValueOnce([avatarUrl]).mockResolvedValueOnce([correctedUrl]);
    const review = vi.spyOn(quality, "classifyPetAppearanceImage")
      .mockResolvedValueOnce({ ...acceptedQuality, [check]: false, reason })
      .mockResolvedValueOnce(acceptedQuality);
    const owned: string[] = [];
    expect(await generatePetAppearance(previous, async (url) => { owned.push(url); })).toEqual({ avatar: correctedUrl, avatarFacing: "left" });
    expect(previous.avatar).toBe(sourceUrl);
    expect(previous.artRank).toBe(1);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(edit.mock.calls[1]![0].previousImg).toBe(edit.mock.calls[0]![0].previousImg);
    await expectOpaqueReference(edit.mock.calls[1]![0].previousImg, reference);
    expect(edit.mock.calls[1]![0].prompt).toContain(reason);
    expect(review).toHaveBeenCalledTimes(2);
    for (const [input] of review.mock.calls) expect(input).toMatchObject({ previousImage: reference, previousRank: 1, rank: 2 });
    expect(moderator.classifyNsfwImage).toHaveBeenCalledTimes(2);
    expect(owned).toEqual([avatarUrl, correctedUrl]);
  });

  it("rejects an evolution after its one repair still fails and tracks both uploads", async () => {
    const buffer = await cutout();
    const edit = stubFounder(buffer).mockResolvedValueOnce([avatarUrl]).mockResolvedValueOnce([correctedUrl]);
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, noGroundOrScene: false, reason: "A ground patch below the feet" });
    const owned: string[] = [];
    await expect(generatePetAppearance({ ...pet, rank: 2, artRank: 1, avatar: sourceUrl }, async (url) => { owned.push(url); })).rejects.toThrow("ground patch");
    expect(edit).toHaveBeenCalledTimes(2);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledTimes(2);
    expect(owned).toEqual([avatarUrl, correctedUrl]);
  });

  it("accepts an evolution whose repair fails only the strength comparison and reports a warning", async () => {
    const edit = stubFounder(await cutout()).mockResolvedValueOnce([avatarUrl]).mockResolvedValueOnce([correctedUrl]);
    const reason = "It does not look clearly stronger than the previous image";
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, evolutionStronger: false, reason });
    const warning = vi.spyOn(Sentry, "captureMessage").mockImplementation(() => "");
    const owned: string[] = [];
    expect(await generatePetAppearance({ ...pet, rank: 2, artRank: 1, avatar: sourceUrl }, async (url) => { owned.push(url); })).toEqual({ avatar: correctedUrl, avatarFacing: "left" });
    expect(edit).toHaveBeenCalledTimes(2);
    expect(owned).toEqual([avatarUrl, correctedUrl]);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ level: "warning", extra: expect.objectContaining({ rank: 2, reason }) }));
  });

  it("still rejects a repair that fails the strength comparison and another check", async () => {
    stubFounder(await cutout()).mockResolvedValueOnce([avatarUrl]).mockResolvedValueOnce([correctedUrl]);
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, evolutionStronger: false, identityPreserved: false, reason: "A different animal" });
    const warning = vi.spyOn(Sentry, "captureMessage").mockImplementation(() => "");
    await expect(generatePetAppearance({ ...pet, rank: 2, artRank: 1, avatar: sourceUrl }, async () => {})).rejects.toThrow("different animal");
    expect(warning).not.toHaveBeenCalled();
  });

  it("sends the downloaded WebP bytes through the SDK instead of asking OpenAI to fetch a fresh upload", async () => {
    const buffer = await cutout();
    stubFounder(buffer, false);
    const transport = vi.spyOn(Moderations.prototype, "create").mockImplementation(() => Promise.resolve({ results: [{ categories: {}, category_scores: {} }] }) as never);
    expect(await generatePetAppearance(pet, async () => {})).toEqual({ avatar: avatarUrl, avatarFacing: "left" });
    expect(transport).toHaveBeenCalledTimes(1);
    const request = transport.mock.calls[0]![0];
    const input = Array.isArray(request.input) ? request.input[0] : null;
    if (!input || typeof input === "string" || input.type !== "image_url") throw new Error("Expected image moderation input");
    const dataUrl = input.image_url.url;
    expect(dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(Buffer.from(dataUrl.split(",")[1]!, "base64")).toEqual(buffer);
    expect(transport.mock.calls[0]![1]).toEqual({ signal: expect.any(AbortSignal), timeout: 30_000, maxRetries: 0 });
  });

  it("shares the job signal with Nano Banana and moderation, combining it with each download timeout", async () => {
    const provider = stubFounder(await cutout());
    const controller = new AbortController();
    await generatePetAppearance(pet, async () => {}, controller.signal);
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
    const moderation = vi.spyOn(moderator, "classifyNsfwImage");
    expect(moderation.mock.calls.every((call) => call[2] === controller.signal)).toBe(true);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledWith(expect.any(Object), controller.signal);
    const download = vi.spyOn(globalThis, "fetch");
    const downloadSignal = download.mock.calls[0]![1]?.signal;
    expect(downloadSignal).not.toBe(controller.signal);
    expect(downloadSignal?.aborted).toBe(false);
    controller.abort();
    expect(downloadSignal?.aborted).toBe(true);
  });

  it("does not dispatch any provider when the job was already aborted", async () => {
    const provider = vi.spyOn(replicate, "txt2imgNanoBanana");
    await expect(generatePetAppearance(pet, async () => {}, AbortSignal.abort())).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });

  it("fails closed on download errors, empty bodies and oversized declared responses", async () => {
    const download = vi.spyOn(globalThis, "fetch");
    download.mockResolvedValueOnce(new Response("Missing upload", { status: 404 }));
    await expect(downloadPetImage(sourceUrl)).rejects.toThrow("Could not download");
    download.mockResolvedValueOnce(new Response());
    await expect(downloadPetImage(sourceUrl)).rejects.toThrow("Could not download");
    download.mockResolvedValueOnce(new Response(new Uint8Array(0)));
    await expect(downloadPetImage(sourceUrl)).rejects.toThrow("empty");
    download.mockResolvedValueOnce(new Response(new Uint8Array(1), { headers: { "content-length": String(6 * 1024 * 1024) } }));
    await expect(downloadPetImage(sourceUrl)).rejects.toThrow("too large");
  });

  it("cancels a streaming response that exceeds the byte budget despite an understated header", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { headers: { "content-length": "1" } }));
    await expect(downloadPetImage(sourceUrl)).rejects.toThrow("too large");
    expect(cancelled).toBe(true);
  });
});

const stubFounder = (buffer: Buffer, moderate = true) => {
  if (moderate) vi.spyOn(moderator, "classifyNsfwImage").mockResolvedValue({ isNsfw: false, reason: "Safe" });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(new Blob([buffer as BlobPart])));
  return vi.spyOn(replicate, "txt2imgNanoBanana").mockResolvedValue([avatarUrl]);
};

/** Reference preparation must preserve the animal and make even enclosed alpha gaps unambiguous. */
const expectOpaqueReference = async (dataUrl: string | null | undefined, original: Buffer) => {
  expect(dataUrl).toStartWith("data:image/png;base64,");
  const prepared = Buffer.from(dataUrl!.split(",")[1]!, "base64");
  expect(await sharp(prepared).metadata()).toMatchObject({ format: "png", width: 128, height: 128, hasAlpha: false });
  const pixels = await sharp(prepared).raw().toBuffer();
  const originalPixels = await sharp(original).ensureAlpha().raw().toBuffer();
  for (const [x, y] of [[0, 0], [60, 60]] as const) {
    expect([...pixels.subarray((y * 128 + x) * 3, (y * 128 + x) * 3 + 3)]).toEqual([240, 240, 240]);
    expect(originalPixels[(y * 128 + x) * 4 + 3]).toBe(0);
  }
  expect(pixels.subarray((30 * 128 + 50) * 3, (30 * 128 + 50) * 3 + 3)).toEqual(originalPixels.subarray((30 * 128 + 50) * 4, (30 * 128 + 50) * 4 + 3));
};

const cutout = async (red = 180) => {
  const data = Buffer.alloc(128 * 128 * 4);
  for (let y = 20; y < 110; y++) for (let x = 35; x < 95; x++) {
    if (y >= 50 && y < 70 && x >= 55 && x < 65) continue;
    data[(y * 128 + x) * 4] = red;
    data[(y * 128 + x) * 4 + 3] = 255;
  }
  return sharp(data, { raw: { width: 128, height: 128, channels: 4 } }).webp().toBuffer();
};
