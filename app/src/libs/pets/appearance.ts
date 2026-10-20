/** Generate, inspect and bound companion artwork before the router accepts it. */
import * as Sentry from "@sentry/nextjs";
import sharp from "sharp";
import { PET_GENERATION_TIMEOUT_MS } from "@/drizzle/constants";
import type { PetSpecies, UserPet } from "@/drizzle/schema";
import { validateSceneCharacterImage } from "@/libs/contentReview/sceneCharacter";
import { PIXEL_ART_RENDERING } from "@/libs/imagePrompts";
import { classifyNsfwImage } from "@/libs/moderator";
import { PET_AURAS, PET_CHARACTERISTICS, PET_PALETTES } from "@/libs/pets/catalogue";
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
> & { species: Pick<PetSpecies, "id" | "name" | "description"> | null };

const PET_ART_STYLE = `${PIXEL_ART_RENDERING}
TheNinja-RPG animal sprite: exactly ONE individual animal with ONE head and ONE connected body, natural species-appropriate adult anatomy and head-to-body proportions, no extra heads, duplicate animals or detached body parts. Cosmetic colours, markings, accessories and aura must preserve recognizable species anatomy. Bright eyes mean clear highlights at natural eye size, never an enlarged head or eyes or a shortened beak. Show animal strength through a powerful native torso, shoulders, haunches and species-specific fur, feathers or scales. Keep animal limb anatomy: no hands, human arms or humanoid torso. Use an elevated three-quarter isometric view with the face or beak pointing toward the viewer's LEFT. Fit the complete animal, including every crest tip, foot and tail, inside the central 80% of the canvas with empty 10% margins on all four sides. Keep the same canvas and view angle across ranks. Reframe when needed to fit a physically redesigned form inside the safe margins; uniform scaling, zoom or filling more of the frame alone is not strength.
Clean sprite composition overrides cinematic lighting: draw on a perfectly uniform light gray (#f0f0f0) background, including every gap between legs, tails, wings and body. The backdrop is not part of the animal. Redraw clean hard pixel boundaries; never trace or copy background pixels, grey/black fringe, shadows or artifacts from a reference. Express the selected aura through crisp luminous markings ON the animal, never an exterior glow, outline, cloud, smoke, orbiting ring, floating particles or haze. No dark backdrop, gradient, ground patch, floor, pedestal, platform, cast/contact shadow, scenery, frame, text, watermark, humanoid body, weapons, blood, gore, sexual content, cartoon or chibi proportions, soft shading or smoothed edges.`;

const MAX_PET_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PET_IMAGE_PIXELS = 1024 * 1024;

/** Distinct native structures make each rank a physical evolution while retaining its identity. */
const RANK_APPEARANCES = [
  "A modest companion: a lean compact adult with a simple unadorned natural silhouette and no developed crest, mantle or decorative armour",
  "A sturdy scout: visibly deepen and strengthen the torso, and replace the light idle stance with a firmly braced, confident stance",
  "A powerful tracker: keep every existing crest, ruff and protective feather, but transform the supporting body into a low, forward-ready hunting stance. Give it visibly larger, heavier native paws or talons (or thicker wing/fin roots), longer strong claws where natural, and pronounced powerful haunches. Make the extremities roughly half again as substantial as the prior form while preserving its recognizable facial design and natural eye proportions. The changed leg geometry, extremities and body build must be conspicuous, not just new fur lines",
  "An armoured guardian: preserve the powerful paws, talons and hunting build, then add a NEW broad, two-tier protective mantle of native fur, overlapping feathers, scales or shell around the shoulders and chest. Its layered outline must project conspicuously beyond the previous simple ruff or body edge. Broaden and deepen the supporting chest/core so this is a heavy protective form, not the same animal with extra fur lines or a changed foreleg pose",
  "A formidable hunter: radically develop its existing natural weapons. Give it conspicuously long, thick, hooked claws or talons, and a longer, heavier native beak or jaw; use powerful locomotor fins for a species without these features. These must be large new shapes, not tiny details. Support them with a deeper athletic torso and much heavier native legs, wing roots or swimming core in a forward, ready-to-strike stance. Retain its developed crest, guardian mantle and recognizable facial design",
  "An imposing warden: flare the native shoulder protection into broad projecting shields of THREE stepped layers of fur, feathers, scales or shell. Spread any existing wings or fins partway to support those wide shields; retain the original limb count. This protective outline must become dramatically wider than the supplied form, not painted-on lines. Give it a deep barrel chest and heavy supporting neck beneath the wide protection, retaining its crest, mantle and natural weapons",
  "A majestic sentinel: expand its existing native rear display into a sweeping layered tail, tail-feather fan, caudal fin or rear shell/body contour, visibly broader and more substantial than before. Reinforce the rear body and supporting limbs or swimming/flight core beneath that display; retain the heavy front mantle",
  "A mythic beast: build a high, broad, two-tier dorsal mantle along the entire neck and back from its native fur, feathers, dorsal fin or shell ridge. These large angular layers must rise well beyond the old back line, comparable in height to its head, rather than a few small spikes. Deepen and thicken the body beneath them. Keep the previous rear display fully spread and at least as developed; shrinking it to add back details is not progress. No new limb type, horn or body part absent from this species",
  "A sovereign companion: raise and widen the existing head/neck crest, mane, feather crown or front shell contour into a grand tiered upper silhouette, preserving the recognizable face and natural eye proportions. Give it an exceptionally broad, deep front body with thick natural support and a planted commanding stance",
  "A celestial legendary beast: add TWO large NEW structural tiers. Below the existing neck/chest mantle, build a broad projecting lower protective tier with long native fur, feather, fin or shell points extending outward on both sides of the chest. Below the existing rear fan/display, add a second large sweeping lower tier extending down and out, visibly separate from the upper tier. Preserve the high crown and developed protection, but rebuild the supporting chest and native limbs into a much heavier, firmly planted apex body; mammal paws must have broad padded bases carrying their claws. Reframe to fit all tips. These must be conspicuous new projecting contours, not extra surface lines or a larger copy of the old fans",
] as const;

/** Only authored catalogue text enters the model; the player's chosen name is never a prompt. */
export const getPetAppearancePrompt = (pet: AppearancePet) => {
  const { species, palette, characteristic, aura } = getPetAppearanceTraits(pet);
  const rank = getPetRank(pet.rank);
  const identity = `${species.description}. Colour palette: ${palette.description}. Distinctive identity: ${characteristic.description}. Aura: ${aura.description}.`;
  const maturity = `Evolution rank ${rank.rank} of 10 (${rank.name}): ${RANK_APPEARANCES[rank.rank - 1]}. Adapt every feature to this species: do not invent fur, limbs or other anatomy it does not naturally possess. Natural adult proportions override words such as young or small in the species description. Preserve its recognizable face, eye colours, primary palette and characteristic identity. Keep all limbs inside the frame.`;
  const edit =
    pet.artRank < pet.rank
      ? "Create a newly drawn full-body design of the next evolution, using the reference to identify the SAME individual animal rather than copying its body design. Carry forward or increase the visual weight of its developed crest, mantle, protective layers and rear display. You may reshape, merge and reorganize those native structures into a stronger new silhouette; do not erase developed features or return to a simpler form. Make this rank's milestone a substantial physical redesign of its build and native structures. It must read clearly stronger even with all markings and aura ignored. A near-copy, extra decoration, brighter outline or camera zoom is not an evolution. Preserve identity, not an identical pose or silhouette."
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
