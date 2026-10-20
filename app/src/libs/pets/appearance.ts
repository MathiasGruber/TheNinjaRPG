/** Generate, inspect and bound companion artwork before the router accepts it. */
import * as Sentry from "@sentry/nextjs";
import sharp from "sharp";
import { PET_GENERATION_TIMEOUT_MS } from "@/drizzle/constants";
import type { PetSpecies, UserPet } from "@/drizzle/schema";
import { validateSceneCharacterImage } from "@/libs/contentReview/sceneCharacter";
import { PIXEL_ART_RENDERING } from "@/libs/imagePrompts";
import { classifyNsfwImage } from "@/libs/moderator";
import {
  PET_AURAS,
  PET_CHARACTERISTICS,
  PET_PALETTES,
  PET_RANK_APPEARANCES,
} from "@/libs/pets/catalogue";
import { getPetRank } from "@/libs/pets/progression";
import {
  classifyPetAppearanceImage,
  validatePetAppearanceQuality,
} from "@/libs/pets/quality";
import { txt2imgNanoBanana, uploadFileFromReplicate } from "@/libs/replicate";
import { servedUfsUrl } from "@/libs/uploadthing";

/** Authored traits and last accepted image needed for initial art, redraws or evolution. */
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
> & {
  species: Pick<
    PetSpecies,
    "id" | "name" | "description" | "artDirection" | "rankConcepts"
  > | null;
};

const PET_ART_STYLE = `${PIXEL_ART_RENDERING}
TheNinja-RPG animal sprite: exactly ONE individual animal with ONE head and ONE connected body, natural species-appropriate adult anatomy and head-to-body proportions, no extra heads, duplicate animals or detached body parts. Cosmetic colours, markings, accessories and aura must preserve recognizable species anatomy. Bright eyes mean clear highlights at natural eye size, never an enlarged head or eyes or a shortened beak. Show strength through athletic native anatomy, a confident pose and a clean, readable silhouette with smooth species-specific fur, feathers or scales, never through bulk, spikes or stacked layers. Keep animal limb anatomy: no hands, human arms or humanoid torso. Use an elevated three-quarter isometric view with the face or beak pointing toward the viewer's LEFT. Fit the complete animal, including every crest tip, foot and tail, inside the central 80% of the canvas with empty 10% margins on all four sides. Keep the same canvas and view angle across ranks. Reframe when needed to fit a physically redesigned form inside the safe margins; uniform scaling, zoom or filling more of the frame alone is not strength.
Clean sprite composition overrides cinematic lighting: draw on a perfectly uniform light gray (#f0f0f0) background, including every gap between legs, tails, wings and body. The backdrop is not part of the animal. Redraw clean hard pixel boundaries; never trace or copy background pixels, grey/black fringe, shadows or artifacts from a reference. Express the selected aura through crisp luminous markings ON the animal, never an exterior glow, outline, cloud, smoke, orbiting ring, floating particles or haze. No dark backdrop, gradient, ground patch, floor, pedestal, platform, cast/contact shadow, scenery, frame, text, watermark, humanoid body, weapons, blood, gore, sexual content, cartoon or chibi proportions, soft shading or smoothed edges.`;

const MAX_PET_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PET_IMAGE_PIXELS = 1024 * 1024;

/** Only authored catalogue text enters the model; the player's chosen name is never a prompt. */
export const getPetAppearancePrompt = (pet: AppearancePet) => {
  const { species, palette, characteristic, aura } = getPetAppearanceTraits(pet);
  const rank = getPetRank(pet.rank);
  const artDirection = species.artDirection
    ? ` Species art direction: ${toClause(species.artDirection)}.`
    : "";
  const identity = `${species.description}.${artDirection} Colour palette: ${palette.description}. Distinctive identity: ${characteristic.description}. Aura: ${aura.description}.`;
  const maturity = `Evolution rank ${rank.rank} of 10 (${rank.name}): ${getPetRankConcept(species, rank.rank)}. Adapt every feature to this species: do not invent fur, limbs or other anatomy it does not naturally possess. Natural adult proportions override words such as young or small in the species description. Preserve its recognizable face, eye colours, primary palette and characteristic identity. Keep all limbs inside the frame.`;
  const edit =
    pet.artRank < pet.rank
      ? "Create a newly drawn full-body design of the next evolution, using the reference to identify the SAME individual animal rather than copying its pixels. Make this rank's named change obvious even at thumbnail size and keep the earlier rank features unless this rank refines or replaces them; you may simplify or remove clutter from the reference. Keep the animal the same size on the canvas as the reference unless this rank says it grows, never larger than 80% of the canvas, with the empty margins intact. It must look more advanced and more impressive than the reference through refinement, presence, markings, ornament or pose, never through extra bulk, fur, feather or scale layers, or filling the frame. Never draw spiky or porcupine-like masses, stacked layers, tails merged into the body or each other, additional tails, wings, horns, extra limbs or other body parts this species does not naturally have, a smaller animal, or cartoon or chibi proportions. A near-copy, brighter outline or camera zoom is not an evolution. Preserve identity, not an identical pose or silhouette."
      : "Redraw the supplied image as the SAME individual animal at its CURRENT rank, power and maturity. Do not evolve it, rank it up or age it.";
  return pet.avatar
    ? `${maturity} ${edit} The neutral reference backdrop is only for readability. Use the animal as an identity reference and redraw it cleanly; remove all prior background, shadow and image artifacts. ${identity} ${PET_ART_STYLE}`
    : `Full-body ${species.name} companion with recognizable species anatomy and natural adult proportions. ${identity} ${maturity} ${PET_ART_STYLE}`;
};

/**
 * Produce a moderated, complete cutout and verify an evolution's visual identity.
 * Await onUpload for each stored intermediate/final URL before further review so
 * the caller can track and clean up uploads even when a later check fails.
 * The caller persists the accepted image and its facing together in a guarded write.
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
  /** Apply the same cutout, moderation and visual checks to initial and corrective candidates. */
  const generateCandidate = async (
    candidatePrompt: string,
    referenceImage?: Buffer,
  ) => {
    signal.throwIfAborted();
    // Explicit opaque reference pixels prevent transparent gaps being interpreted as black fur.
    // Inline bytes reuse the downloaded image without another upload or provider request.
    const reference = referenceImage
      ? await sharp(referenceImage, { limitInputPixels: MAX_PET_IMAGE_PIXELS })
          .flatten({ background: "#f0f0f0" })
          .png()
          .toBuffer()
      : undefined;
    signal.throwIfAborted();
    const [avatar] = await txt2imgNanoBanana({
      preprompt: PET_ART_STYLE,
      prompt: candidatePrompt,
      previousImg: reference
        ? `data:image/png;base64,${reference.toString("base64")}`
        : undefined,
      removeBg: true,
      backgroundRemovalModel: "851-labs",
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
    return { avatar, image, verdict };
  };
  let candidate = await generateCandidate(prompt, previousImage);
  try {
    validatePetAppearanceQuality(candidate.verdict);
  } catch {
    // Correct visual failures once under the same deadline; safety/provider failures never retry.
    // Evolution repairs start from the accepted form so rejected cutout artifacts do not propagate.
    candidate = await generateCandidate(
      `Create a new full-body ${species.name} candidate from the supplied reference. The previous attempt was rejected for these visible defects: ${candidate.verdict.reason}. Correct those defects while following this complete request: ${prompt}`,
      previousImage ?? candidate.image,
    );
    // The strength comparison is subjective; a corrected sprite that passes every
    // objective check is kept rather than spending the player's limited attempts.
    validatePetAppearanceQuality(candidate.verdict, {
      requireStrongerEvolution: false,
    });
    if (!candidate.verdict.evolutionStronger)
      Sentry.captureMessage(
        "Accepted companion evolution not judged clearly stronger",
        {
          level: "warning",
          extra: {
            speciesId: pet.speciesId,
            rank: pet.rank,
            reason: candidate.verdict.reason,
          },
        },
      );
  }
  signal.throwIfAborted();
  let avatar = candidate.avatar;
  // Keep profiles and evolution references left-facing without another model prediction.
  // Lossless mirroring preserves the reviewed pixels and transparency.
  if (candidate.verdict.avatarFacing === "right") {
    const mirrored = await sharp(candidate.image, {
      limitInputPixels: MAX_PET_IMAGE_PIXELS,
    })
      .flop()
      .webp({ lossless: true, exact: true })
      .toBuffer();
    signal.throwIfAborted();
    const uploaded = await uploadFileFromReplicate(
      "pet",
      new Blob([mirrored as BlobPart], { type: "image/webp" }),
      "webp",
      signal,
    );
    if (!uploaded.data) throw new Error("Could not upload the normalized pet image");
    avatar = servedUfsUrl(uploaded.data);
    await onUpload(avatar);
  }
  signal.throwIfAborted();
  return { avatar, avatarFacing: "left" as const };
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
      previousRank: pet.artRank,
    },
    signal,
  );
};

/** A staff-authored concept for this species' rank, else the generic built-in milestone. */
const getPetRankConcept = (species: Pick<PetSpecies, "rankConcepts">, rank: number) => {
  const concept = species.rankConcepts[rank - 1];
  return concept?.trim() ? toClause(concept) : PET_RANK_APPEARANCES[rank - 1];
};

/** Authored text is joined into sentences, so drop its own closing punctuation and spacing. */
const toClause = (text: string) => text.trim().replace(/[\s.]+$/, "");

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
