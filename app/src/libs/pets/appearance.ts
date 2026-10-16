/** Generate, inspect and bound companion artwork before the router accepts it. */
import sharp from "sharp";
import { PET_GENERATION_TIMEOUT_MS } from "@/drizzle/constants";
import type { PetSpecies, UserPet } from "@/drizzle/schema";
import { validateSceneCharacterImage } from "@/libs/contentReview/sceneCharacter";
import { classifyNsfwImage } from "@/libs/moderator";
import { PET_AURAS, PET_CHARACTERISTICS, PET_PALETTES } from "@/libs/pets/catalogue";
import { getPetRank } from "@/libs/pets/progression";
import {
  classifyPetAppearanceImage,
  validatePetAppearanceQuality,
} from "@/libs/pets/quality";
import {
  fastTxt2imgReplicate,
  removeBackgroundReplicate,
  txt2imgNanoBanana,
  uploadFileFromReplicate,
} from "@/libs/replicate";
import { servedUfsUrl } from "@/libs/uploadthing";

/** Authored identity and last accepted image needed for initial art or an evolution. */
type AppearancePet = Pick<
  UserPet,
  | "userId"
  | "speciesId"
  | "paletteIndex"
  | "characteristicIndex"
  | "auraIndex"
  | "rank"
  | "artRank"
  | "avatar"
> & { species: Pick<PetSpecies, "id" | "name" | "description"> | null };

const PET_ART_STYLE =
  "Detailed retro pixel art for TheNinja-RPG, exactly ONE individual animal with ONE head and ONE connected body, natural species-appropriate limbs, no extra heads, duplicate animals or detached body parts. Clear readable silhouette, complete head, feet and tail inside the frame with a small margin, relaxed three-quarter pose with the face or beak pointing toward the viewer's LEFT, mature animal proportions, restrained fantasy shinobi accents. Isolated subject on a plain solid background for background removal. Floating sprite without any ground patch, floor, pedestal, platform or cast/contact shadow. No scenery, frame, text, watermark, humanoid body, weapons, blood, gore or sexual content.";

const MAX_PET_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PET_IMAGE_PIXELS = 1024 * 1024;

const RANK_APPEARANCES = [
  "A small young companion with simple natural markings, soft features and a barely visible aura",
  "An alert adolescent scout with a sharper gaze, a taller stance and a trace of chakra at the silhouette",
  "A mature muscular tracker with stronger natural anatomy, confident posture and clearly defined identity markings",
  "A powerful adult guardian with a protective natural crest or ruff and a visible, restrained chakra glow",
  "A formidable battle-seasoned hunter with a broad strong silhouette, focused eyes and layered natural markings; no injuries or gore",
  "An imposing warden with ornate chakra patterns following the original identity markings and stronger species-appropriate crest details",
  "A majestic sentinel with regal natural proportions, prominent species-appropriate mane, feathers, shell or crest and a luminous aura",
  "A mythic beast with grand mature anatomy, bright chakra markings and controlled spirit wisps gathered tightly around the body",
  "A sovereign companion with an impressive natural mantle or elaborate crest, richly luminous identity markings and dense controlled chakra motes",
  "A celestial legendary beast, unmistakably the same individual at its fullest majestic maturity, with extraordinary species-appropriate crest or mantle, radiant original markings and a brilliant contained chakra aura",
] as const;

/** Only authored catalogue text enters the model; the player's chosen name is never a prompt. */
export const getPetAppearancePrompt = (pet: AppearancePet) => {
  const { species, palette, characteristic, aura } = getPetAppearanceTraits(pet);
  const rank = getPetRank(pet.rank);
  const identity = `${species.description}. Colour palette: ${palette.description}. Distinctive identity: ${characteristic.description}. Aura: ${aura.description}.`;
  const maturity = `Evolution rank ${rank.rank} of 10 (${rank.name}): ${RANK_APPEARANCES[rank.rank - 1]}. This rank's age, stature and maturity override words such as young, small or modest in the species description. Higher ranks must look visibly stronger and more majestic, while retaining the original species, face, colour layout and distinctive identity. Keep all limbs inside the frame.`;
  return pet.avatar
    ? `Edit the supplied image into the next evolution of the SAME individual animal. Preserve its exact species, face, eye colours, primary colour placement, distinctive markings, accessories and basic left-facing pose. Do not replace or redesign the animal. ${identity} ${maturity} ${PET_ART_STYLE}`
    : `One original friendly animal companion. ${identity} ${maturity} ${PET_ART_STYLE}`;
};

/**
 * Produce a moderated, complete cutout and verify an evolution's visual identity.
 * Await onUpload for each stored intermediate/final URL before further review so
 * the caller can track and clean up uploads even when a later check fails.
 * Returning a URL does not persist readiness; the caller owns that guarded write.
 */
export const generatePetAppearance = async (
  pet: AppearancePet,
  onUpload: (url: string) => Promise<void>,
  signal = AbortSignal.timeout(PET_GENERATION_TIMEOUT_MS),
) => {
  signal.throwIfAborted();
  const prompt = getPetAppearancePrompt(pet);
  // Fetch the accepted reference before spending on an edit, then reuse it for identity review.
  const previousImage = pet.avatar
    ? await downloadPetImage(pet.avatar, signal)
    : undefined;
  let avatar: string | undefined;
  let image: Buffer | undefined;
  if (pet.avatar) {
    // The existing reference-image path retains the previous accepted form instead of rerolling identity.
    [avatar] = await txt2imgNanoBanana({
      preprompt: PET_ART_STYLE,
      prompt,
      previousImg: pet.avatar,
      removeBg: true,
      userId: pet.userId,
      width: 512,
      height: 512,
      size: "square",
      signal,
    });
    if (avatar) await onUpload(avatar);
    if (avatar) image = await downloadPetImage(avatar, signal);
  } else {
    const generated = await fastTxt2imgReplicate({
      prompt,
      aspect_ratio: "1:1",
      disable_safety_checker: false,
      output_quality: 80,
      mega_pixels: "0.25",
      signal,
    });
    const source = generated.data ? servedUfsUrl(generated.data) : null;
    if (!source) throw new Error("The image provider did not return an image");
    await onUpload(source);
    await checkModeration(await downloadPetImage(source, signal), signal);
    const cutout = await removeBackgroundReplicate(source, signal);
    image = await sharp(await downloadPetImage(String(cutout.url()), signal), {
      limitInputPixels: MAX_PET_IMAGE_PIXELS,
    })
      .resize({ width: 512, height: 512, fit: "inside" })
      .webp({ quality: 80 })
      .toBuffer();
    await validateSceneCharacterImage(image);
    await checkModeration(image, signal);
    await checkVisualQuality(image, previousImage, pet, signal);
    const uploaded = await uploadFileFromReplicate(
      "pet",
      new Blob([image as BlobPart]),
      "webp",
      signal,
    );
    avatar = uploaded.data ? servedUfsUrl(uploaded.data) : undefined;
    if (avatar) await onUpload(avatar);
  }
  if (!avatar || !image) throw new Error("The image provider did not return an image");
  if (pet.avatar) {
    await checkModeration(image, signal);
    await validateSceneCharacterImage(image);
    await checkVisualQuality(image, previousImage, pet, signal);
  }
  signal.throwIfAborted();
  return avatar;
};

/** Check the candidate against authored traits and, for evolution, the accepted prior form. */
const checkVisualQuality = async (
  image: Buffer,
  previousImage: Buffer | undefined,
  pet: AppearancePet,
  signal: AbortSignal,
) => {
  const { species, palette, characteristic, aura } = getPetAppearanceTraits(pet);
  const verdict = await classifyPetAppearanceImage(
    {
      image,
      previousImage,
      species: species.description,
      identity: [
        palette.description,
        characteristic.description,
        aura.description,
      ].join(". "),
      rank: pet.rank,
    },
    signal,
  );
  validatePetAppearanceQuality(verdict);
};

/** Resolve saved catalogue IDs and reject corrupt identity before calling an image model. */
const getPetAppearanceTraits = (pet: AppearancePet) => {
  const species = pet.species;
  const palette = PET_PALETTES[pet.paletteIndex];
  const characteristic = PET_CHARACTERISTICS[pet.characteristicIndex];
  const aura = PET_AURAS[pet.auraIndex];
  if (!species || species.id !== pet.speciesId || !palette || !characteristic || !aura)
    throw new Error("Invalid pet appearance traits");
  return { species, palette, characteristic, aura };
};

/**
 * Download nonempty image bytes under the caller's cancellation and a local timeout.
 * Streaming enforces the byte cap even if upstream misstates Content-Length;
 * decoding and content checks are performed separately before acceptance.
 */
export const downloadPetImage = async (imageUrl: string, signal?: AbortSignal) => {
  const downloadSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  downloadSignal.throwIfAborted();
  const response = await fetch(imageUrl, { signal: downloadSignal });
  if (!response.ok || !response.body)
    throw new Error("Could not download the generated image");
  if (Number(response.headers.get("content-length")) > MAX_PET_IMAGE_BYTES) {
    await response.body.cancel();
    throw new Error("The generated image is too large");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PET_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("The generated image is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error("The generated image is empty");
  return Buffer.concat(chunks, total);
};

/** Bound decoding, identify the actual image format and fail closed on unsafe/absent moderation. */
const checkModeration = async (image: Buffer, signal: AbortSignal) => {
  signal.throwIfAborted();
  if (image.byteLength > MAX_PET_IMAGE_BYTES)
    throw new Error("The generated image is too large");
  const metadata = await sharp(image, {
    limitInputPixels: MAX_PET_IMAGE_PIXELS,
  }).metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format))
    throw new Error("The generated image has an unsupported format");
  // Fresh uploads may not yet be reachable by OpenAI. Send the bytes already
  // downloaded by this server, with the MIME type detected from their contents.
  const dataUrl = `data:image/${metadata.format};base64,${image.toString("base64")}`;
  const result = await classifyNsfwImage(dataUrl, true, signal);
  if (!result || result.isNsfw)
    throw new Error("The generated image did not pass content review");
};
