import { type PrismaClient } from "@prisma/client";
import { type Session } from "next-auth";
import { type UserData } from "@prisma/client";

export const getPrompt = async (
  ctx: {
    session: Session;
    prisma: PrismaClient;
  },
  currentUser: UserData
) => {
  const userAttributes = await ctx.prisma.userAttribute.findMany({
    where: { userId: ctx.session?.user?.id },
    distinct: ["attribute"],
  });
  const attributes = userAttributes
    .map((attribute) => attribute.attribute)
    .join(", ");
  const getAge = (rank: string) => {
    switch (rank) {
      case " Student":
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
        return "adult";
    }
  };

  return `${currentUser.gender}, ${getAge(
    currentUser.rank
  )}, ${attributes}, anime, soft lighting, detailed face, by makoto shinkai, stanley artgerm lau, wlop, rossdraws, concept art, digital painting, looking into camera`;
};

/**
 * Request new avatar from Replicate API
 * @returns {Promise<{ id: string }>}
 */
interface ReplicateReturn {
  id: string;
  output: string[] | null;
  status: string;
}
export const createAvatar = async (
  prompt: string
): Promise<ReplicateReturn> => {
  return fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
    },
    body: JSON.stringify({
      version:
        "27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478",
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
