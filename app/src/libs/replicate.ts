import OpenAI from "openai";
import { fetchAttributes } from "../server/api/routers/profile";
import sharp from "sharp";
import { UTApi, UTFile } from "uploadthing/server";
import { env } from "@/env/server.mjs";
import { tmpdir } from "os";
import path from "path";
import Replicate from "replicate";
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
import type { FileOutput } from "replicate";
import type { IMG_ORIENTATION } from "@/drizzle/constants";

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
export const getAvatarPrompt = async (client: DrizzleClient, user: UserData) => {
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
            return "teenage boy";
          case "Female":
            return "teenage girl";
          default:
            return "teenage";
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
  )}, ${attributes}, fully clothed, anime, rossdraws portrait, stanley artgerm lau, wlop, looking into camera, interesting background`;
};

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
 * Create a fast image from text using Replicate
 * @param prompt - The prompt to create the image from
 * @param disable_safety_checker - Whether to disable the safety checker
 * @returns The URL of the image
 */
export const fastTxt2imgReplicate = async (config: {
  prompt: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16";
  disable_safety_checker?: boolean;
}) => {
  const { prompt, aspect_ratio = "1:1", disable_safety_checker = false } = config;
  const replicate = new Replicate({
    auth: env.REPLICATE_API_TOKEN,
  });
  const input = {
    prompt: prompt,
    go_fast: true,
    megapixels: "0.25",
    num_outputs: 1,
    aspect_ratio: aspect_ratio,
    output_format: "webp",
    output_quality: 50,
    num_inference_steps: 4,
    disable_safety_checker: disable_safety_checker,
  };
  const outputs = (await replicate.run("black-forest-labs/flux-schnell", {
    input,
  })) as FileOutput[];
  const output = outputs?.[0];
  if (!output) throw new Error("No output from AI model");
  const blob = await output.blob();
  const uploadedFile = await uploadFileFromReplicate("preview", blob, "webp");
  return uploadedFile;
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
  size: IMG_ORIENTATION;
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
    size:
      config.size === "square"
        ? "1024x1024"
        : config.size === "portrait"
          ? "1024x1536"
          : "1536x1024",
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
        .resize({ width, height, fit: "inside" })
        .webp({ quality: 70 })
        .toBuffer();
      return new File([resultBuffer], `${prefix}-${idx}-${i}.webp`);
    }),
  );
  const uploadedFiles = await utapi.uploadFiles(resizedImages);
  return uploadedFiles;
};

interface FileEsque extends Blob {
  name: string;
}

/**
 * Create a thumbnail for the image
 */
export const createThumbnail = async (url?: string | null) => {
  if (!url) return null;
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
 * Upload a file from a Replicate run session
 * @param object - The Replicate object
 * @param key - The key of the file to upload
 * @param generationId - The generation ID
 * @returns The uploaded files
 */
export const uploadFileFromReplicate = async (
  prefix: string,
  blob: Blob,
  extension = "webp",
) => {
  const utapi = new UTApi();
  const utFiles = new File([blob], `${prefix}-${nanoid()}.${extension}`);
  const uploadedFile = await utapi.uploadFiles(utFiles);
  return uploadedFile;
};
