import { createUploadthing } from "uploadthing/next-legacy";
import { eq, sql, gt, and, isNotNull } from "drizzle-orm";
import { historicalAvatar, userData } from "../../drizzle/schema";
import { drizzleDB } from "./db";
import type { FileRouter } from "uploadthing/next-legacy";
import type { NextApiRequest } from "next";
import type { FederalStatuses } from "../../drizzle/constants";

const f = createUploadthing({
  errorFormatter: (err) => {
    console.log("error", err);
    console.log("cause", err.cause);
    return {
      message: err.message,
    };
  },
});

export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "64KB" } })
    .middleware(async ({ req }) => await avatarMiddleware(req))
    .onUploadComplete(({ file }) => {
      return { fileUrl: file.url };
    }),
  avatarNormalUploader: f({ image: { maxFileSize: "128KB" } })
    .middleware(async ({ req }) => await avatarMiddleware(req, "NORMAL"))
    .onUploadComplete(async ({ metadata, file }) => {
      await uploadHistoricalAvatar(file, metadata.userId, true);
    }),
  avatarSilverUploader: f({ image: { maxFileSize: "256KB" } })
    .middleware(async ({ req }) => await avatarMiddleware(req, "SILVER"))
    .onUploadComplete(async ({ metadata, file }) => {
      await uploadHistoricalAvatar(file, metadata.userId, true);
    }),
  avatarGoldUploader: f({ image: { maxFileSize: "512KB" } })
    .middleware(async ({ req }) => await avatarMiddleware(req, "GOLD"))
    .onUploadComplete(async ({ metadata, file }) => {
      await uploadHistoricalAvatar(file, metadata.userId, true);
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;

/**
 * Limits number of created avatars / day
 * @param req
 * @returns
 */
const avatarMiddleware = async (
  req: NextApiRequest,
  fedRequirement?: (typeof FederalStatuses)[number],
) => {
  const { userId } = JSON.parse(req.body as string) as { userId: string };
  if (!userId) throw new Error("Unauthorized");
  const avatars = await drizzleDB
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(historicalAvatar)
    .where(
      and(
        eq(historicalAvatar.userId, userId),
        isNotNull(historicalAvatar.avatar),
        gt(historicalAvatar.createdAt, sql`NOW() - INTERVAL 1 DAY`),
      ),
    );
  const nRecentAvatars = avatars?.[0]?.count || 0;
  if (nRecentAvatars > 50) throw new Error("Can only upload 50 files per day");
  // Federal check
  if (fedRequirement) {
    const user = await drizzleDB.query.userData.findFirst({
      where: eq(userData.userId, userId),
    });
    if (!user) throw new Error("User not found");
    if (user.federalStatus !== fedRequirement) {
      throw new Error("You must be " + fedRequirement + " to upload this avatar");
    }
  }
  return { userId: userId };
};

/**
 * Update the historical avatars database
 * @param file
 * @param userId
 */
const uploadHistoricalAvatar = async (
  file: { url: string },
  userId: string,
  updateUser?: boolean,
) => {
  const promises = [
    drizzleDB.insert(historicalAvatar).values({
      replicateId: null,
      avatar: file.url,
      status: "succeeded",
      userId: userId,
      done: 1,
    }),
    ...(updateUser
      ? [
          drizzleDB
            .update(userData)
            .set({ avatar: file.url })
            .where(eq(userData.userId, userId)),
        ]
      : []),
  ];
  await Promise.all(promises);
};
