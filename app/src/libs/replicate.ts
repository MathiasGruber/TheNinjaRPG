import { fetchAttributes } from "../server/api/routers/profile";
import { userData, historicalAvatar, conceptImage } from "@/drizzle/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import { fetchImage } from "@/routers/conceptart";
import sharp from "sharp";
import { UTApi } from "uploadthing/server";
import { env } from "@/env/server.mjs";
import Replicate, { type Prediction } from "replicate";
import type { DrizzleClient } from "@/server/db";
import type { UserData, UserRank } from "@/drizzle/schema";

/**
 * The prompt to be used for creating the avatar
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
      case "COMMANDER":
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
  const uploadedFile = await utapi.uploadFilesFromUrl(url);
  const uploadedFileUrl = uploadedFile.data?.url ?? null;
  return uploadedFileUrl;
};

/**
 * Create an image from text
 */
export const txt2img = async (config: {
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
    const result = await txt2img({ prompt: prompt, width: 512, height: 512 });
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
    const imageUrl = response.data?.url;
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
      imageUrl = response.data?.url;
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
