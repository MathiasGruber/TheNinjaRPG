import { copyImageToStorage } from "./aws";
import { fetchAttributes } from "../server/api/routers/profile";
import { userData, historicalAvatar, conceptImage } from "@/drizzle/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import { fetchImage } from "@/routers/conceptart";
import sharp from "sharp";
import { UTApi } from "uploadthing/server";
import type { DrizzleClient } from "@/server/db";
import type { UserData, UserRank } from "@/drizzle/schema";
import type { Prediction } from "replicate";

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
    user.gender
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
export const requestAvatar = async (prompt: string): Promise<ReplicateReturn> => {
  return fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
    },
    body: JSON.stringify({
      version: "db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
      input: {
        prompt: prompt,
        negative_prompt: "two heads, 2people, 2face",
        image_dimensions: "512x512",
        num_outputs: 1,
        num_inference_steps: 50,
        guidance_scale: 20,
        scheduler: "DDIM",
      },
    }),
  }).then((response) => response.json() as Promise<ReplicateReturn>);
};

/**
 * Request new content image
 */
export const requestContentImage = async (prompt: string): Promise<ReplicateReturn> => {
  return fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
    },
    body: JSON.stringify({
      version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      input: {
        prompt: prompt,
        width: 512,
        height: 512,
        refine: "expert_ensemble_refiner",
        scheduler: "K_EULER",
        lora_scale: 0.6,
        num_outputs: 1,
        guidance_scale: 7.0,
        apply_watermark: false,
        high_noise_frac: 0.8,
        negative_prompt:
          "deformed,weird,bad resolution,bad depiction,weird,worst quality,worst resolution,too blurry,not relevant,text",
        prompt_strength: 0.8,
        num_inference_steps: 25,
      },
    }),
  }).then((response) => response.json() as Promise<ReplicateReturn>);
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
export const fetchReplicateResult = async (
  replicateId: string
): Promise<ReplicateReturn> => {
  return fetch(`https://api.replicate.com/v1/predictions/${replicateId}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
    },
  }).then((response) => response.json() as Promise<ReplicateReturn>);
};

/**
 * Send a request to update the avatar for a user
 */
export const updateAvatar = async (client: DrizzleClient, user: UserData) => {
  const currentProcessing = await client.query.historicalAvatar.findFirst({
    where: and(
      eq(historicalAvatar.userId, user.userId),
      eq(historicalAvatar.done, 0),
      isNotNull(historicalAvatar.replicateId)
    ),
  });
  if (!currentProcessing) {
    const prompt = await getPrompt(client, user);
    const result = await requestAvatar(prompt);
    if (user.avatar) {
      await client
        .update(userData)
        .set({ avatar: null })
        .where(eq(userData.userId, user.userId));
    }
    await client.insert(historicalAvatar).values({
      replicateId: result.id,
      avatar: null,
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
  const avatars = await client.query.historicalAvatar.findMany({
    where: and(
      eq(historicalAvatar.userId, user.userId),
      eq(historicalAvatar.done, 0),
      isNotNull(historicalAvatar.replicateId)
    ),
  });
  if (avatars.length === 0 && !user.avatar) {
    return await updateAvatar(client, user);
  }
  let url = user.avatar;
  for (const avatar of avatars) {
    if (avatar.replicateId) {
      const result = await fetchReplicateResult(avatar.replicateId);
      // If failed or canceled, rerun
      let isDone = true;
      if (
        result.status === "failed" ||
        result.status === "canceled" ||
        (result.status === "succeeded" && !result.output)
      ) {
        await updateAvatar(client, user);
      } else if (result.status == "succeeded" && result.output?.[0]) {
        url = await copyImageToStorage(result.output[0], result.id);
        if (url) {
          await client
            .update(userData)
            .set({ avatar: url })
            .where(eq(userData.userId, user.userId));
        }
      } else {
        isDone = false;
      }
      if (isDone) {
        await client
          .update(historicalAvatar)
          .set({ done: 1, avatar: url, status: result.status })
          .where(eq(historicalAvatar.id, avatar.id));
      }
    }
  }
  return url;
};

interface FileEsque extends Blob {
  name: string;
}

export const syncImage = async (
  client: DrizzleClient,
  prediction: Prediction,
  userId?: string
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
        "https://utfs.io/f/2138a3d6-98e1-492d-9029-e3824a40177b-3j2f18.png"
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
  if (prediction.status !== result.status) {
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
