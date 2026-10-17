import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import Replicate from "replicate";
import sharp from "sharp";
import { UTApi } from "uploadthing/server";
import { fastTxt2imgReplicate, removeBackgroundReplicate, txt2imgNanoBanana } from "@/libs/replicate";

const upload = { data: { ufsUrl: "https://example.com/upload.webp" }, error: null };
let savedWindow: PropertyDescriptor | undefined;
let savedToken: string | undefined;
beforeEach(() => {
  // Server SDK configuration still runs before the stubbed upload methods.
  savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Reflect.deleteProperty(globalThis, "window");
  savedToken = process.env.UPLOADTHING_TOKEN;
  process.env.UPLOADTHING_TOKEN = Buffer.from(JSON.stringify({ apiKey: "sk_test_not_a_real_key", appId: "abort-test", regions: ["fra1"] })).toString("base64");
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (savedToken === undefined) delete process.env.UPLOADTHING_TOKEN;
  else process.env.UPLOADTHING_TOKEN = savedToken;
});

describe("image provider abort propagation", () => {
  it("returns an abort while the SDK remains stalled and never starts a paid fallback", async () => {
    const controller = new AbortController();
    const run = vi.spyOn(Replicate.prototype, "run").mockImplementation(async () => {
      controller.abort(new DOMException("Generation deadline reached", "TimeoutError"));
      return new Promise<object>(() => {});
    });
    const uploading = vi.spyOn(UTApi.prototype, "uploadFilesFromUrl");
    await expect(fastTxt2imgReplicate({ prompt: "A fox", signal: controller.signal })).rejects.toThrow("Generation deadline reached");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![1].signal).toBe(controller.signal);
    expect(uploading).not.toHaveBeenCalled();
  });

  it("does not dispatch a background-removal model with an already aborted signal", async () => {
    const run = vi.spyOn(Replicate.prototype, "run");
    await expect(removeBackgroundReplicate("https://example.com/source.webp", AbortSignal.abort())).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it("uses the same live signal for a genuine provider fallback and the upload", async () => {
    const controller = new AbortController();
    const file = { url: () => new URL("https://example.com/provider.webp") };
    const run = vi.spyOn(Replicate.prototype, "run").mockRejectedValueOnce(new Error("Flux unavailable")).mockResolvedValueOnce(file);
    const uploading = vi.spyOn(UTApi.prototype, "uploadFilesFromUrl").mockResolvedValue(upload as never);
    await fastTxt2imgReplicate({ prompt: "A fox", signal: controller.signal });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]![0]).toBe("black-forest-labs/flux-schnell");
    expect(run.mock.calls[1]![0]).toBe("prunaai/p-image");
    expect(run.mock.calls.every((call) => call[1].signal === controller.signal)).toBe(true);
    expect(uploading.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it("propagates an evolution signal through Nano Banana, background removal and upload", async () => {
    const controller = new AbortController();
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 4, background: "transparent" } }).webp().toBuffer();
    const file = { url: () => new URL("https://example.com/provider.webp"), blob: async () => new Blob([buffer as BlobPart]) };
    const run = vi.spyOn(Replicate.prototype, "run").mockResolvedValue(file);
    const uploading = vi.spyOn(UTApi.prototype, "uploadFiles").mockResolvedValue(upload as never);
    expect(await txt2imgNanoBanana({ preprompt: "Pixel art", prompt: "Evolve the same fox", previousImg: "https://example.com/previous.webp", removeBg: true, userId: "owner", width: 512, height: 512, size: "square", signal: controller.signal })).toEqual([upload.data.ufsUrl]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]![0]).toBe("google/nano-banana");
    expect(String(run.mock.calls[1]![0])).toStartWith("lucataco/remove-bg:");
    expect(run.mock.calls.every((call) => call[1].signal === controller.signal)).toBe(true);
    expect(uploading.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });
});
