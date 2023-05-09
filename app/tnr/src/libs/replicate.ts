import { type PrismaClient } from "@prisma/client";
import { type UserData } from "@prisma/client";
import { uploadAvatar } from "./aws";

/**
 * The prompt to be used for creating the avatar
 */
export const getPrompt = async (client: PrismaClient, user: UserData) => {
  const userAttributes = await client.userAttribute.findMany({
    where: { userId: user.userId },
    distinct: ["attribute"],
  });
  const attributes = userAttributes.map((attribute) => attribute.attribute).join(", ");
  const getAge = (rank: string) => {
    switch (rank) {
      case "Student":
        return "child";
      case "Genin":
        return "young adult";
      case "Chunin":
        return "adult";
      case "Jounin":
        return "adult";
      case "Special Jounin":
        return "adult";
      default:
        return "old";
    }
  };

  return `${user.gender}, ${getAge(
    user.rank
  )}, ${attributes}, anime, soft lighting, detailed face, by makoto shinkai, stanley artgerm lau, wlop, rossdraws, concept art, digital painting, looking into camera`;
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
      version: "27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478",
      input: {
        prompt: prompt,
        width: 512,
        height: 512,
        prompt_strength: 10,
        num_outputs: 1,
        num_inference_steps: 50,
        guidance_scale: 7.5,
        scheduler: "K_EULER",
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
