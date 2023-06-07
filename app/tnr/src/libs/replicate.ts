import type { UserData, PrismaClient } from "@prisma/client";
import { UserRank } from "@prisma/client";
import { uploadAvatar } from "./aws";

/**
 * The prompt to be used for creating the avatar
 */
export const getPrompt = async (client: PrismaClient, user: UserData) => {
  const userAttributes = await client.userAttribute.findMany({
    where: { userId: user.userId },
    distinct: ["attribute"],
  });
  const attributes = userAttributes
    .sort((a) => (a.attribute.includes("skin") ? -1 : 1))
    .map((attribute) => attribute.attribute)
    .join(", ");

  const getPhenotype = (rank: UserRank, gender: string) => {
    switch (rank) {
      case UserRank.STUDENT:
        switch (gender) {
          case "Male":
            return "boy";
          case "Female":
            return "girl";
          default:
            return "child";
        }
      case UserRank.GENIN:
        switch (gender) {
          case "Male":
            return "teenage boy";
          case "Female":
            return "teenage girl";
          default:
            return "teenager";
        }
      case UserRank.CHUNIN:
        switch (gender) {
          case "Male":
            return "man";
          case "Female":
            return "woman";
          default:
            return "person";
        }
      case UserRank.JONIN:
        switch (gender) {
          case "Male":
            return "man";
          case "Female":
            return "woman";
          default:
            return "person";
        }
      case UserRank.COMMANDER:
        switch (gender) {
          case "Male":
            return "man";
          case "Female":
            return "woman";
          default:
            return "person";
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
 * @param id - Prediction ID to get status of
 * @returns
 */
export const fetchAvatar = async (id: string): Promise<ReplicateReturn> => {
  return fetch(`https://api.replicate.com/v1/predictions/${id}`, {
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
export const updateAvatar = async (client: PrismaClient, user: UserData) => {
  // Get prompt
  const prompt = await getPrompt(client, user);
  console.log("~~~~~~~~~~~~~~~~~~~");
  console.log(prompt);
  console.log("~~~~~~~~~~~~~~~~~~~");
  // Send request for avatar to ML server
  const result = await requestAvatar(prompt);
  // Update user avatar to null
  if (user.avatar) {
    await client.userData.update({
      where: { userId: user.userId },
      data: { avatar: null },
    });
  }
  // Insert the avatar into history, even though it has not been finished processing yet
  return await client.historicalAvatar.create({
    data: {
      replicateId: result.id,
      avatar: null,
      status: result.status,
      userId: user.userId,
    },
  });
};

/**
 * Check if any avatars are unfinished. If so, check for updates, and update the avatar if it is finished
 */
export const checkAvatar = async (client: PrismaClient, user: UserData) => {
  console.log("Now checking avatar creation status");
  console.log("--------------------");
  const avatars = await client.historicalAvatar.findMany({
    where: {
      userId: user.userId,
      done: false,
      replicateId: { not: null },
    },
  });
  if (avatars.length === 0 && !user.avatar) {
    return await updateAvatar(client, user);
  }
  for (const avatar of avatars) {
    console.log(avatar);
    let checkedAvatar = avatar;
    if (avatar.replicateId) {
      let url = null;
      const result = await fetchAvatar(avatar.replicateId);
      console.log("Fetch result");
      console.log(result);
      // If failed or canceled, rerun
      let isDone = true;
      if (
        result.status == "failed" ||
        result.status == "canceled" ||
        (result.status == "succeeded" && !result.output)
      ) {
        checkedAvatar = await updateAvatar(client, user);
      } else if (result.status == "succeeded" && result.output?.[0]) {
        console.log("UPLOADING");
        url = await uploadAvatar(result.output[0], result.id);
        console.log("URL: ", url);
        if (url) {
          await client.userData.update({
            where: { userId: user.userId },
            data: { avatar: url },
          });
        }
      } else {
        isDone = false;
      }
      if (isDone) {
        checkedAvatar = await client.historicalAvatar.update({
          where: { id: avatar.id },
          data: { avatar: url, status: result.status, done: isDone },
        });
      }
    }
    return checkedAvatar;
  }

  // let counter = 0;
  // while (result.status !== "succeeded") {
  //   // If failed or canceled, rerun
  //   if (result.status == "failed" || result.status == "canceled") {
  //     counter += 1;
  //     if (counter > 5) {
  //       throw serverError("TIMEOUT", "Could not be created with 5 attempts");
  //     }
  //     result = await createAvatar(prompt);
  //   }
  //   // If starting or processing, just wait
  //   if (result.status == "starting" || result.status == "processing") {
  //     await sleep(2000);
  //     result = await fetchAvatar(result.id);
  //   }
  //   // If succeeded, download image and upload to S3
  //   if (result.status == "succeeded" && result.output?.[0]) {
  //     const s3_avatar = await uploadAvatar(result.output[0], result.id);
  //     await client.userData.update({
  //       where: { userId: user.userId },
  //       data: { avatar: s3_avatar },
  //     });
  //     await client.historicalAvatar.create({
  //       data: {
  //         avatar: s3_avatar,
  //         userId: user.userId,
  //       },
  //     });
  //     break;
  //   }
  // }
};
