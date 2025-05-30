import OpenAI from "openai";
import { fetchAttributes } from "../server/api/routers/profile";
import { userData, historicalAvatar, conceptImage } from "@/drizzle/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import { fetchImage } from "@/routers/conceptart";
import sharp from "sharp";
import { UTApi, UTFile } from "uploadthing/server";
import { env } from "@/env/server.mjs";
import { tmpdir } from "os";
import path from "path";
import Replicate, { type Prediction } from "replicate";
import type { DrizzleClient } from "@/server/db";
import type { UserData, UserRank } from "@/drizzle/schema";
import { nanoid } from "nanoid";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  resample,
  prune,
  dedup,
  textureCompress,
  weld,
  meshopt,
} from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import fs from "fs";

/**
 * Compress a gltf file
 * @param url The URL of the gltf file to compress
 * @returns The compressed gltf file
 */
export const compressGltf = async (url: string) => {
  await MeshoptEncoder.ready;

  // 3. Initialize NodeIO (network not needed since binary embedded)
  const io = new NodeIO(fetch)
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder })
    .setAllowNetwork(true);

  // 4. Read, transform with explicit modules, and write
  const document = await io.read(url);
  await document.transform(
    weld(),
    resample(),
    prune(),
    dedup(),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
    textureCompress({
      encoder: sharp,
      quality: 80,
      targetFormat: "webp",
      resize: [256, 256],
    }),
    // Custom transform: backface culling…
  );
  const localPath = path.join(tmpdir(), `${nanoid()}-compressed.glb`);
  await io.write(localPath, document);
  return { localPath };
};

/**
 * Get the prompt for the avatar
 * @param client The database client
 * @param user The user to get the prompt for
 * @returns The prompt for the avatar
 */
export const getPrompt = async (client: DrizzleClient, user: UserData) => {
  const userAttributes = await fetchAttributes(client, user.userId);
  const attributes = userAttributes
    .sort((a) => (a.attribute.includes("skin") ? -1 : 1))
    .map((attribute) => attribute.attribute)
    .join(", ");

  const getPhenotype = (rank: UserRank, gender: string) => {
    switch (rank) {
      case "STUDENT":
        switch (gender) {
          case "Male":
            return "boy";
          case "Female":
            return "girl";
          default:
            return "child";
        }
      case "GENIN":
        switch (gender) {
          case "Male":
            return "teenage boy";
          case "Female":
            return "teenage girl";
          default:
            return "teenager";
        }
      case "CHUNIN":
        switch (gender) {
          case "Male":
            return "man";
          case "Female":
            return "woman";
          default:
            return "person";
        }
      case "JONIN":
        switch (gender) {
          case "Male":
            return "man";
          case "Female":
            return "woman";
          default:
            return "person";
        }
      case "ELITE JONIN":
        switch (gender) {
          case "Male":
            return "old man";
          case "Female":
            return "old woman";
          default:
            return "old person";
        }
      default:
        switch (gender) {
          case "Male":
            return "old man wrinkles";
          case "Female":
            return "old woman wrinkles";
          default:
            return "old person wrinkles";
        }
    }
  };
  return `${getPhenotype(
    user.rank,
    user.gender,
  )}, ${attributes}, anime, portrait poster, soft lighting, detailed face, by stanley artgerm lau, wlop, rossdraws, concept art, looking into camera`;
};

/**
 * Request new avatar from Replicate API
 */
interface ReplicateReturn {
  id: string;
  output: string[] | string | null;
  status: string;
}

/**
 * Upload file from URL to uploadthing
 */
export const uploadToUT = async (url: string) => {
  const utapi = new UTApi();
  const extension = path.extname(url).replace(/^\./, "") || "bin";
  const name = `${nanoid()}.${extension}`;
  if (!url.startsWith("http")) {
    const fileBuffer = await fs.promises.readFile(url);
    const uploadedFile = await utapi.uploadFiles(new UTFile([fileBuffer], name));
    return uploadedFile.data?.ufsUrl ?? null;
  } else {
    const uploadedFile = await utapi.uploadFilesFromUrl({ url, name });
    return uploadedFile.data?.ufsUrl ?? null;
  }
};

/**
 * Create an image from text
 */
export const txt2imgReplicate = async (config: {
  prompt: string;
  width: number;
  height: number;
  negative_prompt?: string;
  guidance_scale?: number;
  seed?: number;
}) => {
  // Replicate instantiate
  const replicate = new Replicate({
    auth: env.REPLICATE_API_TOKEN,
  });
  // Set defaults
  const negative_prompt = config?.negative_prompt ?? "";
  const guidance_scale = config?.guidance_scale ?? 7.5;
  const seed = config?.seed ?? Math.floor(Math.random() * 1000000);
  // Run repliacte
  const output = await replicate.predictions.create({
    version: "ed6d8bee9a278b0d7125872bddfb9dd3fc4c401426ad634d8246a660e387475b",
    input: {
      seed: seed,
      width: config.width,
      height: config.height,
      prompt: config.prompt,
      scheduler: "K_EULER_ANCESTRAL",
      num_outputs: 1,
      guidance_scale: guidance_scale,
      safety_checker: true,
      negative_prompt:
        negative_prompt +
        ", child, nsfw, porn, sex, canvas frame, cartoon, 3d, ((disfigured)), ((bad art)), ((deformed)),((extra limbs)),((close up)),((b&w)), wierd colors, blurry,  (((duplicate))), ((morbid)), ((mutilated)), [out of frame], extra fingers, mutated hands, ((poorly drawn hands)), ((poorly drawn face)), (((mutation))), (((deformed))), ((ugly)), blurry, ((bad anatomy)), (((bad proportions))), ((extra limbs)), cloned face, (((disfigured))), out of frame, ugly, extra limbs, (bad anatomy), gross proportions, (malformed limbs), ((missing arms)), ((missing legs)), (((extra arms))), (((extra legs))), mutated hands, (fused fingers), (too many fingers), (((long neck))), Photoshop, video game, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, mutation, mutated, extra limbs, extra legs, extra arms, disfigured, deformed, cross-eye, body out of frame, blurry, bad art, bad anatomy, 3d render ENSD: 31337",
      prompt_strength: 0.8,
      num_inference_steps: 50,
      webhook: `https://www.theninja-rpg.com/api/replicate`,
    },
  });
  return output;
};

/**
 * Create an image from text using OpenAI
 * @param config The configuration for the image generation
 * @returns The URL of the image
 */
export const txt2imgGPT = async (config: {
  preprompt: string;
  prompt: string;
  previousImg?: string | null;
  removeBg: boolean;
  userId: string;
  width: number;
  height: number;
}) => {
  const client = new OpenAI();

  // Prepare the input image
  const inputImage = config.previousImg
    ? await fetch(config.previousImg).then(async (response) => {
        const blob = await response.blob();
        return new File([blob], `${config.userId}-${nanoid()}.webp`, {
          type: "image/webp",
        });
      })
    : null;

  // Common config
  const commonConfig = {
    background: config.removeBg ? "transparent" : "auto",
    model: "gpt-image-1",
    size: "1024x1024",
    quality: "high",
    user: config.userId,
    prompt: inputImage
      ? config.prompt
      : `
      <system prompt>
        ${config.preprompt}
      </system prompt>
      <user prompt>
        ${config.prompt} ${config.removeBg ? "remove background" : "include appropriate background"}
      </user prompt>
    `,
  } as const;

  // Create/Edit the image
  const image = inputImage
    ? await client.images.edit({ image: inputImage, ...commonConfig })
    : await client.images.generate(commonConfig);

  // Upload the image to UploadThing
  const uploadedFiles = await uploadImageFromOpenAI({
    prefix: "content",
    img: image,
    idx: nanoid(),
    width: config.width,
    height: config.height,
  });

  // Return the URL of the image
  return uploadedFiles?.[0]?.data?.ufsUrl ?? null;
};
/**
 * Create a 3D model from an image
 * @param url The URL of the image to create a 3D model from
 */
export const img2model = async (url: string) => {
  const replicate = new Replicate({
    auth: env.REPLICATE_API_TOKEN,
  });
  const output = await replicate.predictions.create({
    version: "4876f2a8da1c544772dffa32e8889da4a1bab3a1f5c1937bfcfccb99ae347251",
    input: {
      seed: Math.floor(Math.random() * 1000000),
      images: [url],
      texture_size: 2048,
      mesh_simplify: 0.9,
      generate_color: false,
      generate_model: true,
      randomize_seed: true,
      generate_normal: false,
      save_gaussian_ply: false,
      ss_sampling_steps: 50,
      slat_sampling_steps: 50,
      return_no_background: false,
      ss_guidance_strength: 7.5,
      slat_guidance_strength: 3,
    },
  });
  return output;
};

/**
 * Upload an image from OpenAI to UploadThing
 * @param img - The image to upload
 * @param generationId - The generation ID
 * @returns The uploaded files
 */
export const uploadImageFromOpenAI = async (config: {
  prefix: string;
  img: OpenAI.Images.ImagesResponse;
  idx: string;
  width: number;
  height: number;
}) => {
  const { prefix, img, idx, width, height } = config;
  if (!img.data) throw new Error("No data");
  const utapi = new UTApi();
  const resizedImages = await Promise.all(
    img.data.map(async (data, i) => {
      const blob = Buffer.from(data.b64_json!, "base64");
      const resultBuffer = await sharp(blob)
        .resize(width, height)
        .webp({ quality: 70 })
        .toBuffer();
      return new File([resultBuffer], `${prefix}-${idx}-${i}.webp`);
    }),
  );
  const uploadedFiles = await utapi.uploadFiles(resizedImages);
  return uploadedFiles;
};

/**
 * Remove background
 */
export const requestBgRemoval = async (url: string): Promise<ReplicateReturn> => {
  return fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
    },
    body: JSON.stringify({
      version: "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      input: { image: url },
    }),
  }).then((response) => response.json() as Promise<ReplicateReturn>);
};

/**
 * Fetches result from Replicate API
 */
export const fetchReplicateResult = async (replicateId: string) => {
  // Replicate instantiate
  const replicate = new Replicate({
    auth: env.REPLICATE_API_TOKEN,
  });
  const prediction = await replicate.predictions.get(replicateId);
  let replicateUrl: string | null = null;
  if (typeof prediction.output === "string") {
    replicateUrl = prediction.output;
  } else if (prediction.output && "model_file" in prediction.output) {
    replicateUrl = (prediction.output as { model_file: string }).model_file;
    // If this is a glb, compress it
    if (replicateUrl.endsWith(".glb")) {
      const compressed = await compressGltf(replicateUrl);
      replicateUrl = compressed.localPath;
    }
  } else {
    replicateUrl = (prediction.output as string[])?.[0] ?? null;
  }
  return { prediction, replicateUrl };
};

/**
 * Send a request to update the avatar for a user
 */
export const requestAvatarForUser = async (client: DrizzleClient, user: UserData) => {
  const currentProcessing = await client.query.historicalAvatar.findFirst({
    where: and(
      eq(historicalAvatar.userId, user.userId),
      eq(historicalAvatar.done, 0),
      isNotNull(historicalAvatar.replicateId),
    ),
  });
  if (!currentProcessing) {
    const prompt = await getPrompt(client, user);
    const result = await txt2imgReplicate({ prompt: prompt, width: 512, height: 512 });
    if (user.avatar) {
      await client
        .update(userData)
        .set({ avatar: null, avatarLight: null })
        .where(eq(userData.userId, user.userId));
    }
    await client.insert(historicalAvatar).values({
      replicateId: result.id,
      avatar: null,
      avatarLight: null,
      status: result.status,
      userId: user.userId,
    });
  }
  return null;
};

/**
 * Check if any avatars are unfinished. If so, check for updates, and update the avatar if it is finished
 */
export const checkAvatar = async (client: DrizzleClient, user: UserData) => {
  // Currently processing
  const avatars = await client.query.historicalAvatar.findMany({
    where: and(
      eq(historicalAvatar.userId, user.userId),
      eq(historicalAvatar.done, 0),
      isNotNull(historicalAvatar.replicateId),
    ),
  });
  // If none processing, request new avatar and return
  if (avatars.length === 0 && !user.avatar) {
    return await requestAvatarForUser(client, user);
  }
  // Go through processing avatars and see if any finished
  let url = user.avatar;
  let thumbnail = user.avatarLight;
  for (const avatar of avatars) {
    if (avatar.replicateId) {
      // Get the URL on replicate for the end result
      const { prediction, replicateUrl } = await fetchReplicateResult(
        avatar.replicateId,
      );
      // If failed or canceled, rerun
      let isDone = true;
      if (
        prediction.status === "failed" ||
        prediction.status === "canceled" ||
        (prediction.status === "succeeded" && !prediction.output)
      ) {
        await requestAvatarForUser(client, user);
      } else if (prediction.status == "succeeded" && replicateUrl) {
        url = await uploadToUT(replicateUrl);
        if (url) {
          thumbnail = await createThumbnail(url);
          await client
            .update(userData)
            .set({ avatar: url, avatarLight: thumbnail })
            .where(eq(userData.userId, user.userId));
        }
      } else {
        isDone = false;
      }
      if (isDone) {
        const thumbnail = url ? await createThumbnail(url) : null;
        await client
          .update(historicalAvatar)
          .set({
            done: 1,
            avatar: url,
            avatarLight: thumbnail,
            status: prediction.status,
          })
          .where(eq(historicalAvatar.id, avatar.id));
      }
    }
  }
  return url;
};

interface FileEsque extends Blob {
  name: string;
}

/**
 * Create a thumbnail for the image
 */
export const createThumbnail = async (url: string) => {
  try {
    const res = await fetch(url);
    const blob = await res.arrayBuffer();
    const resultBuffer = await sharp(blob).resize(64, 64).toBuffer();
    const thumbnail = new Blob([resultBuffer]) as FileEsque;
    thumbnail.name = "thumbnail.png";
    const utapi = new UTApi();
    const response = await utapi.uploadFiles(thumbnail);
    const imageUrl = response.data?.ufsUrl;
    return imageUrl ?? url;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return url;
  }
};

/**
 * Sync image with Replicate API
 */
export const syncImage = async (
  client: DrizzleClient,
  prediction: Prediction,
  userId?: string,
) => {
  const id = prediction.id;
  const result = await fetchImage(client, id, userId ?? "");
  const utapi = new UTApi();
  let imageUrl: string | undefined = undefined;
  if (prediction.status === "succeeded") {
    const url = (prediction.output as string[])?.[0];
    if (url) {
      // Get image from AI service (will expire within 1 hour)
      const res1 = await fetch(
        "https://utfs.io/f/2138a3d6-98e1-492d-9029-e3824a40177b-3j2f18.png",
      );
      const watermark_blob = Buffer.from(await res1.arrayBuffer());
      const res = await fetch(url);
      const blob = await res.arrayBuffer();
      const resultBuffer = await sharp(blob)
        .composite([{ input: watermark_blob, top: 0, left: 0 }])
        .toBuffer();
      const watermarkedresult = new Blob([resultBuffer]) as FileEsque;
      watermarkedresult.name = "image.png";
      const response = await utapi.uploadFiles(watermarkedresult);
      imageUrl = response.data?.ufsUrl;
    } else {
      prediction.status = "failed";
    }
  }
  if (result && prediction.status !== result.status) {
    if (prediction.status === "failed") {
      await Promise.all([
        client.delete(conceptImage).where(eq(conceptImage.id, id)),
        client
          .update(userData)
          .set({ reputationPoints: sql`${userData.reputationPoints} + 1` })
          .where(eq(userData.userId, result.userId)),
      ]);
    } else {
      await client
        .update(conceptImage)
        .set({
          status: prediction.status,
          image: imageUrl,
          done: prediction.status === "succeeded" ? 1 : 0,
        })
        .where(eq(conceptImage.id, id));
    }
  }
  return result;
};
