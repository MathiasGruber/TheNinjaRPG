import { uploadAvatar } from "./aws";
import { fetchAttributes } from "../server/api/routers/profile";
import { userData, historicalAvatar } from "../../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import type { DrizzleClient } from "../server/db";
import type { UserData, UserRank } from "../../drizzle/schema";

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
  output: string[] | null;
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
        width: 512,
        height: 512,
        num_outputs: 1,
        num_inference_steps: 100,
        guidance_scale: 20,
        scheduler: "DDIM",
      },
    }),
  }).then((response) => response.json() as Promise<ReplicateReturn>);
};
/**
 * Fetches result from Replicate API
 */
export const fetchAvatar = async (replicateId: string): Promise<ReplicateReturn> => {
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
  console.log("Update avatar for user", user.userId);
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
  return null;
};

/**
 * Check if any avatars are unfinished. If so, check for updates, and update the avatar if it is finished
 */
export const checkAvatar = async (client: DrizzleClient, user: UserData) => {
  console.log("Check avatar for user", user.userId);
  const avatars = await client.query.historicalAvatar.findMany({
    where: and(
      eq(historicalAvatar.userId, user.userId),
      eq(historicalAvatar.done, 0),
      isNotNull(historicalAvatar.replicateId)
    ),
  });
  if (avatars.length === 0 && !user.avatar) {
    console.log("No avatars found, user has no avatar, user: ", user.userId);
    return await updateAvatar(client, user);
  }
  let url = null;
  for (const avatar of avatars) {
    if (avatar.replicateId) {
      const result = await fetchAvatar(avatar.replicateId);
      // If failed or canceled, rerun
      let isDone = true;
      if (
        result.status == "failed" ||
        result.status == "canceled" ||
        (result.status == "succeeded" && !result.output)
      ) {
        await updateAvatar(client, user);
      } else if (result.status == "succeeded" && result.output?.[0]) {
        url = await uploadAvatar(result.output[0], result.id);
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
