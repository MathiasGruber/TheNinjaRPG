import { createUploadthing } from "uploadthing/next-legacy";
import { eq, sql, gt, and, isNotNull } from "drizzle-orm";
import { historicalAvatar } from "../../drizzle/schema";
import { drizzleDB } from "./db";
import type { FileRouter } from "uploadthing/next-legacy";

const f = createUploadthing();

export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "64KB" } })
    .middleware(async ({ req }) => {
      // eslint-disable-next-line
      const { userId } = JSON.parse(req.body) as { userId: string };
      if (!userId) throw new Error("Unauthorized");
      const avatars = await drizzleDB
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(historicalAvatar)
        .where(
          and(
            eq(historicalAvatar.userId, userId),
            isNotNull(historicalAvatar.avatar),
            gt(historicalAvatar.createdAt, sql`NOW() - INTERVAL 1 DAY`)
          )
        );
      const nRecentAvatars = avatars?.[0]?.count || 0;
      if (nRecentAvatars > 50) throw new Error("Can only upload 50 files per day");
      return { userId: userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await drizzleDB.insert(historicalAvatar).values({
        replicateId: null,
        avatar: file.url,
        status: "succeeded",
        userId: metadata.userId,
        done: 1,
      });
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
