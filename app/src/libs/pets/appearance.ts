/** Generate, inspect and bound companion artwork before the router accepts it. */
import sharp from "sharp";
import { PET_GENERATION_TIMEOUT_MS } from "@/drizzle/constants";
import type { PetSpecies, UserPet } from "@/drizzle/schema";
import { validateSceneCharacterImage } from "@/libs/contentReview/sceneCharacter";
import { PIXEL_ART_STYLE } from "@/libs/imagePrompts";
import { classifyNsfwImage } from "@/libs/moderator";
import { PET_AURAS, PET_CHARACTERISTICS, PET_PALETTES } from "@/libs/pets/catalogue";
import { getPetRank } from "@/libs/pets/progression";
import {
  classifyPetAppearanceImage,
  validatePetAppearanceQuality,
} from "@/libs/pets/quality";
import { txt2imgNanoBanana } from "@/libs/replicate";

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

const PET_ART_STYLE = `${PIXEL_ART_STYLE}
TheNinja-RPG animal sprite: exactly ONE individual animal with ONE head and ONE connected body, natural species-appropriate adult anatomy and head-to-body proportions, no extra heads, duplicate animals or detached body parts. Cosmetic colours, markings, accessories and aura must preserve recognizable species anatomy. Bright eyes mean clear highlights at natural eye size, never an enlarged head or eyes or a shortened beak. Clear readable silhouette, complete head, feet and tail inside the frame with a small margin, fixed elevated three-quarter isometric view and a relaxed pose with the face or beak pointing toward the viewer's LEFT, restrained fantasy shinobi accents. Isolated subject on a plain solid background for background removal. Floating sprite without any ground patch, floor, pedestal, platform or cast/contact shadow. No scenery, frame, text, watermark, humanoid body, weapons, blood, gore, sexual content, cartoon or chibi proportions, soft shading or smoothed edges.`;

const MAX_PET_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PET_IMAGE_PIXELS = 1024 * 1024;

const RANK_APPEARANCES = [
  "A modest companion with simple natural markings, an unadorned silhouette and a barely visible aura",
  "An alert lean scout with a focused gaze, a taller stance and a trace of chakra at the silhouette",
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
  const maturity = `Evolution rank ${rank.rank} of 10 (${rank.name}): ${RANK_APPEARANCES[rank.rank - 1]}. Show power through stature, stance, markings and aura, not baby-to-adult anatomy. Natural adult species proportions override words such as young or small in the species description. Higher ranks must look visibly stronger and more majestic, while retaining the original species, face, colour layout and distinctive identity. Keep all limbs inside the frame.`;
  return pet.avatar
    ? `Edit the supplied image into the next evolution of the SAME individual animal. Preserve its exact species, face, eye colours, primary colour placement, distinctive markings, accessories and basic left-facing pose. Do not replace or redesign the animal. ${identity} ${maturity} ${PET_ART_STYLE}`
    : `Full-body ${species.name} companion with recognizable species anatomy and natural adult proportions. ${identity} ${maturity} ${PET_ART_STYLE}`;
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
  const { species } = getPetAppearanceTraits(pet);
  // Fetch the accepted reference before spending on an edit, then reuse it for identity review.
  const previousImage = pet.avatar
    ? await downloadPetImage(pet.avatar, signal)
    : undefined;
  // Every candidate follows the same model, cutout, moderation and visual review path.
  const generateCandidate = async (candidatePrompt: string, previousImg?: string) => {
    signal.throwIfAborted();
    const [avatar] = await txt2imgNanoBanana({
      preprompt: PET_ART_STYLE,
      prompt: candidatePrompt,
      previousImg,
      removeBg: true,
      userId: pet.userId,
      width: 512,
      height: 512,
      size: "square",
      signal,
    });
    if (!avatar) throw new Error("The image provider did not return an image");
    await onUpload(avatar);
    const image = await downloadPetImage(avatar, signal);
    await checkModeration(image, signal);
    await validateSceneCharacterImage(image);
    const verdict = await reviewVisualQuality(image, previousImage, pet, signal);
    return { avatar, verdict };
  };
  let candidate = await generateCandidate(prompt, pet.avatar ?? undefined);
  try {
    validatePetAppearanceQuality(candidate.verdict);
  } catch (error) {
    if (pet.avatar) throw error;
    // Correct a rejected founder once; provider and safety failures never spend on a repair.
    candidate = await generateCandidate(
      `Redraw the supplied candidate as a full-body ${species.name}. Correct these visible defects: ${candidate.verdict.reason}. Redraw incorrect head, beak, body and silhouette into the requested species; retain cosmetic colours and markings only where compatible with its natural anatomy. ${prompt}`,
      candidate.avatar,
    );
    validatePetAppearanceQuality(candidate.verdict);
  }
  signal.throwIfAborted();
  return candidate.avatar;
};

/** Review the candidate's species and, for evolution, the accepted prior identity. */
const reviewVisualQuality = async (
  image: Buffer,
  previousImage: Buffer | undefined,
  pet: AppearancePet,
  signal: AbortSignal,
) => {
  const { species, palette, characteristic, aura } = getPetAppearanceTraits(pet);
  return classifyPetAppearanceImage(
    {
      image,
      previousImage,
      species: species.name,
      identity: [
        palette.description,
        characteristic.description,
        aura.description,
      ].join(". "),
      rank: pet.rank,
    },
    signal,
  );
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
