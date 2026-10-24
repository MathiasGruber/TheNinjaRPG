/**
 * Prepare native ETC2 derivatives of a reviewed animation catalogue with Khronos
 * KTX-Software (`--ktx <binary>`). Review the generated files before rerunning with
 * `--publish --reviewed <sha256-list.json>`; only reviewed, smaller derivatives
 * enter the client manifest. Originals and
 * database bindings remain unchanged. Generated binaries stay outside Git.
 *
 * make bun ARGS='run scripts/publish-animation-textures.ts --input <catalogue.json>
 *   --work-dir <directory> --ktx <binary> [--publish --reviewed <sha256-list.json>]'
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { UTApi, UTFile } from "uploadthing/server";
import { animationTextureKey, animationTextureUrl } from "@/libs/threejs/animationTextures";
import { transformImageUrl } from "@/utils/image";
import { servedUfsUrl } from "@/libs/uploadthing";
import { spriteAnimationSchema } from "@/validators/spriteAnimation";
import { getFlagValue } from "./cli";

/** Run the official encoder without a shell, propagating validation failures. */
const runKtx = async (binary: string, args: string[]) => {
  const { stdout } = await promisify(execFile)(binary, args);
  return stdout;
};

/** Exact rendition bytes determine immutable output names, independent of catalogue IDs. */
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/** Encode first; publishing is a separate explicit step after reviewing the derivatives. */
const main = async () => {
  const args = process.argv.slice(2);
  const input = getFlagValue(args, "--input");
  const work = getFlagValue(args, "--work-dir");
  const binary = getFlagValue(args, "--ktx");
  if (!input || !work || !binary) throw new Error("Provide --input, --work-dir and --ktx");
  const reviewedFile = getFlagValue(args, "--reviewed");
  if (args.includes("--publish") && !reviewedFile)
    throw new Error("Provide --reviewed with the reviewed derivative SHA-256 list before publishing");
  const reviewed = new Set<string>(reviewedFile ? JSON.parse(readFileSync(reviewedFile, "utf8")) : []);
  mkdirSync(work, { recursive: true });
  const catalogue = JSON.parse(readFileSync(input, "utf8")) as unknown[];
  const animations = catalogue.flatMap((row) => {
    const parsed = spriteAnimationSchema.safeParse(row);
    return parsed.success ? [{ ...parsed.data, id: "derivative" }] : [];
  });
  console.log(`Accepted ${animations.length}/${catalogue.length} short-loop animations`);
  const publishedPath = join(work, "published.json");
  const published: Record<string, string> = existsSync(publishedPath)
    ? JSON.parse(readFileSync(publishedPath, "utf8")) : {};
  const api = args.includes("--publish") ? new UTApi() : undefined;
  const rows: Array<{ key: string; sourceUrl: string; sourceSha256: string; file: string;
    sha256: string; webpBytes: number; bytes: number; width: number; height: number;
    cellSize: number; url?: string }> = [];
  const jobs = animations.flatMap((animation) => [128, 256].map((cellSize) => ({ animation, cellSize })));
  for (let index = 0; index < jobs.length; index += 4) {
    await Promise.all(jobs.slice(index, index + 4).map(async ({ animation, cellSize }) => {
      const sourceUrl = animationTextureUrl(animation, cellSize);
      const source = join(work, `${digest(sourceUrl).slice(0, 24)}.webp`);
      if (!existsSync(source)) {
        const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(90_000) });
        if (!response.ok) throw new Error(`Rendition HTTP ${response.status}: ${sourceUrl}`);
        writeFileSync(source, new Uint8Array(await response.arrayBuffer()));
      }
      const bytes = readFileSync(source);
      const metadata = await sharp(bytes).metadata();
      const width = animation.columns * cellSize;
      const height = animation.rows * cellSize;
      if (metadata.width !== width || metadata.height !== height || !metadata.hasAlpha)
        throw new Error(`Incorrect rendition dimensions/alpha: ${sourceUrl}`);
      const hash = digest(bytes);
      const png = join(work, `${hash}.png`);
      const basis = join(work, `${hash}.q255-c4.basis.ktx2`);
      const file = join(work, `${hash}.q255-c4.etc2.ktx2`);
      if (!existsSync(png)) await sharp(bytes).png().toFile(png);
      if (!existsSync(basis)) await runKtx(binary, ["create", "--format", "R8G8B8A8_SRGB",
        "--encode", "basis-lz", "--qlevel", "255", "--clevel", "4",
        "--no-endpoint-rdo", "--no-selector-rdo", "--threads", "1",
        "--assign-tf", "srgb", "--assign-primaries", "bt709",
        "--convert-texcoord-origin", "bottom-left", png, basis]);
      if (!existsSync(file)) await runKtx(binary, ["transcode", "--target", "etc-rgba", "--zstd", "18", basis, file]);
      const info = JSON.parse(await runKtx(binary, ["info", "--format", "json", file]));
      if (!info.valid || info.header.pixelWidth !== width || info.header.pixelHeight !== height ||
        info.header.vkFormat !== "VK_FORMAT_ETC2_R8G8B8A8_SRGB_BLOCK" ||
        info.header.levelCount !== 1 || info.keyValueData.KTXorientation !== "ru")
        throw new Error(`Invalid native ETC2 sheet: ${file}`);
      const encoded = readFileSync(file);
      const outputHash = digest(encoded);
      let url = published[outputHash];
      if (api && reviewed.has(outputHash) && encoded.length < bytes.length && !url) {
        const customId = `sprite-atlas-etc2-${outputHash}.ktx2`;
        const uploaded = await api.uploadFiles(new UTFile([encoded], customId, { type: "image/ktx2", customId }));
        if (uploaded.error || !uploaded.data) throw new Error(`Upload failed: ${file}`);
        url = transformImageUrl(servedUfsUrl(uploaded.data));
        published[outputHash] = url;
        writeFileSync(publishedPath, `${JSON.stringify(published, null, 2)}\n`, { mode: 0o600 });
      }
      rows.push({ key: animationTextureKey(animation, cellSize), sourceUrl, sourceSha256: hash,
        file, sha256: outputHash, webpBytes: bytes.length, bytes: encoded.length, width, height, cellSize, url });
    }));
    console.log(`Validated ${rows.length}/${jobs.length} renditions`);
    writeFileSync(join(work, "derivatives.json"), `${JSON.stringify(rows, null, 2)}\n`);
  }
  if (api) {
    const manifest = Object.fromEntries(rows.filter((row) => reviewed.has(row.sha256) && row.url && row.bytes < row.webpBytes)
      .sort((a, b) => a.key.localeCompare(b.key)).map((row) => [row.key, row.url]));
    writeFileSync(new URL("../src/libs/threejs/animationTextureVariants.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
  }
};

await main();
