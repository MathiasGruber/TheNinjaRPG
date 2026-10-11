import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import sharp from "sharp";
import { Moderations } from "openai/resources/moderations";
import * as moderator from "@/libs/moderator";
import { downloadPetImage, generatePetAppearance } from "@/libs/pets/appearance";
import * as quality from "@/libs/pets/quality";
import * as replicate from "@/libs/replicate";

const sourceUrl = "https://example.com/source-pet.webp";
const avatarUrl = "https://example.com/accepted-pet.webp";
const pet = { userId: "pet-owner", speciesIndex: 0, paletteIndex: 0, characteristicIndex: 0, auraIndex: 0, rank: 1, artRank: 0, avatar: null };
const acceptedQuality = { singleAnimal: true, anatomyCorrect: true, speciesMatches: true, completeBody: true, noGroundOrScene: true, identityPreserved: true, reason: "A valid pet sprite" };

beforeEach(() => vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue(acceptedQuality));
afterEach(() => vi.restoreAllMocks());

describe("companion provider pipeline", () => {
  it("keeps provider safety enabled and verifies a real alpha cutout before accepting it", async () => {
    const buffer = await cutout();
    const provider = stubFounder(buffer);
    const uploads: string[] = [];
    expect(await generatePetAppearance(pet, async (url) => { uploads.push(url); })).toBe(avatarUrl);
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ disable_safety_checker: false, mega_pixels: "0.25" }));
    expect(moderator.classifyNsfwImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/), true, expect.any(AbortSignal));
    expect(moderator.classifyNsfwImage).toHaveBeenCalledTimes(2);
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledTimes(1);
    expect(uploads).toEqual([sourceUrl, avatarUrl]);
  });

  it("does not remove or accept a source that fails moderation", async () => {
    stubFounder(await cutout());
    vi.spyOn(moderator, "classifyNsfwImage").mockResolvedValue({ isNsfw: true, reason: "Unsafe source" });
    const owned: string[] = [];
    await expect(generatePetAppearance(pet, async (url) => { owned.push(url); })).rejects.toThrow("content review");
    expect(replicate.removeBackgroundReplicate).not.toHaveBeenCalled();
    expect(owned).toEqual([sourceUrl]);
  });

  it("rejects an opaque background instead of saving a broken combat sprite", async () => {
    const opaque = await sharp({ create: { width: 128, height: 128, channels: 3, background: "white" } }).webp().toBuffer();
    stubFounder(opaque);
    await expect(generatePetAppearance(pet, async () => {})).rejects.toThrow("transparent background");
    expect(replicate.uploadFileFromReplicate).not.toHaveBeenCalled();
  });

  it("uses the previous accepted rank image for evolution and applies the same safety checks", async () => {
    const buffer = await cutout();
    vi.spyOn(moderator, "classifyNsfwImage").mockResolvedValue({ isNsfw: false, reason: "Safe" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(new Blob([buffer as BlobPart])));
    const edit = vi.spyOn(replicate, "txt2imgNanoBanana").mockResolvedValue([avatarUrl]);
    const founder = vi.spyOn(replicate, "fastTxt2imgReplicate");
    expect(await generatePetAppearance({ ...pet, rank: 2, artRank: 1, avatar: sourceUrl }, async () => {})).toBe(avatarUrl);
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ previousImg: sourceUrl, removeBg: true, prompt: expect.stringContaining("SAME individual animal") }));
    expect(founder).not.toHaveBeenCalled();
    expect(moderator.classifyNsfwImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/), true, expect.any(AbortSignal));
    expect(quality.classifyPetAppearanceImage).toHaveBeenCalledWith(expect.objectContaining({ image: buffer, previousImage: buffer, rank: 2 }), expect.any(AbortSignal));
  });

  it("rejects a malformed founder before uploading its final sprite", async () => {
    stubFounder(await cutout());
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, singleAnimal: false, reason: "Two heads on one animal" });
    const owned: string[] = [];
    await expect(generatePetAppearance(pet, async (url) => { owned.push(url); })).rejects.toThrow("Two heads");
    expect(replicate.uploadFileFromReplicate).not.toHaveBeenCalled();
    expect(owned).toEqual([sourceUrl]);
  });

  it("rejects an evolution ground fragment while preserving the accepted reference", async () => {
    const previous = { ...pet, rank: 2, artRank: 1, avatar: sourceUrl };
    vi.spyOn(moderator, "classifyNsfwImage").mockResolvedValue({ isNsfw: false, reason: "Safe" });
    const buffer = await cutout();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(new Blob([buffer as BlobPart])));
    vi.spyOn(replicate, "txt2imgNanoBanana").mockResolvedValue([avatarUrl]);
    vi.spyOn(quality, "classifyPetAppearanceImage").mockResolvedValue({ ...acceptedQuality, noGroundOrScene: false, reason: "A ground patch below the feet" });
    const owned: string[] = [];
    await expect(generatePetAppearance(previous, async (url) => { owned.push(url); })).rejects.toThrow("ground patch");
    expect(previous.avatar).toBe(sourceUrl);
    expect(previous.artRank).toBe(1);
    expect(owned).toEqual([avatarUrl]);
  });

  it("sends the downloaded WebP bytes through the SDK instead of asking OpenAI to fetch a fresh upload", async () => {
    const buffer = await cutout();
    stubFounder(buffer, false);
    const transport = vi.spyOn(Moderations.prototype, "create").mockImplementation(() => Promise.resolve({ results: [{ categories: {}, category_scores: {} }] }) as never);
    expect(await generatePetAppearance(pet, async () => {})).toBe(avatarUrl);
    expect(transport).toHaveBeenCalledTimes(2);
    const request = transport.mock.calls[0]![0];
    const input = Array.isArray(request.input) ? request.input[0] : null;
    if (!input || typeof input === "string" || input.type !== "image_url") throw new Error("Expected image moderation input");
    const dataUrl = input.image_url.url;
    expect(dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(Buffer.from(dataUrl.split(",")[1]!, "base64")).toEqual(buffer);
    expect(transport.mock.calls[0]![1]).toEqual({ signal: expect.any(AbortSignal), timeout: 30_000, maxRetries: 0 });
  });

  it("shares the job signal across models, moderation and uploads, combining it with each download timeout", async () => {
    stubFounder(await cutout());
    const controller = new AbortController();
    await generatePetAppearance(pet, async () => {}, controller.signal);
    expect(replicate.fastTxt2imgReplicate).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
    expect(replicate.removeBackgroundReplicate).toHaveBeenCalledWith(sourceUrl, controller.signal);
    expect(replicate.uploadFileFromReplicate).toHaveBeenCalledWith("pet", expect.any(Blob), "webp", controller.signal);
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
    const provider = vi.spyOn(replicate, "fastTxt2imgReplicate");
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
  const provider = vi.spyOn(replicate, "fastTxt2imgReplicate").mockResolvedValue({ data: { ufsUrl: sourceUrl }, error: null } as Awaited<ReturnType<typeof replicate.fastTxt2imgReplicate>>);
  vi.spyOn(replicate, "removeBackgroundReplicate").mockResolvedValue({ url: () => new URL("https://example.com/cutout-pet.webp") } as Awaited<ReturnType<typeof replicate.removeBackgroundReplicate>>);
  vi.spyOn(replicate, "uploadFileFromReplicate").mockResolvedValue({ data: { ufsUrl: avatarUrl }, error: null } as Awaited<ReturnType<typeof replicate.uploadFileFromReplicate>>);
  return provider;
};

const cutout = async () => {
  const data = Buffer.alloc(128 * 128 * 4);
  for (let y = 20; y < 110; y++) for (let x = 35; x < 95; x++) {
    data[(y * 128 + x) * 4] = 180;
    data[(y * 128 + x) * 4 + 3] = 255;
  }
  return sharp(data, { raw: { width: 128, height: 128, channels: 4 } }).webp().toBuffer();
};
