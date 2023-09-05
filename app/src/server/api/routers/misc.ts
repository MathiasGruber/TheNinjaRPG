import { sql } from "drizzle-orm";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { notification, userData } from "../../../../drizzle/schema";
import { canSubmitNotification } from "../../../utils/permissions";
import { fetchUser } from "./profile";
import { baseServerResponse } from "../trpc";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { mutateContentSchema } from "../../../validators/comments";
import PushNotifications from "@pusher/push-notifications-server";

export const miscRouter = createTRPCRouter({
  submitNotification: protectedProcedure
    .input(mutateContentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canSubmitNotification(user.role)) {
        return { success: false, message: "You do not have permission" };
      }
      // Push notifications
      const instanceId = process.env.NEXT_PUBLIC_PUSHER_BEAM_ID;
      const secretKey = process.env.PUSHER_BEAM_SECRET;
      if (instanceId && secretKey) {
        const nhm = new NodeHtmlMarkdown({}, undefined, undefined);
        const client = new PushNotifications({ instanceId, secretKey });
        client
          .publishToInterests(["global"], {
            web: {
              notification: {
                title: "TheNinja-RPG",
                body: nhm.translate(input.content),
                deep_link: "https://www.theninja-rpg.com",
              },
            },
          })
          .then((publishResponse) => {
            console.log("Just published:", publishResponse.publishId);
          })
          .catch((error) => {
            console.log("Error:", error);
          });
      }
      // Update database
      const [result] = await Promise.all([
        ctx.drizzle.insert(notification).values({
          userId: ctx.userId,
          content: input.content,
        }),
        ctx.drizzle
          .update(userData)
          .set({ unreadNotifications: sql`unreadNotifications + 1` }),
      ]);
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could insert notificaiton in db" };
      } else {
        return { success: true, message: "Notification sent" };
      }
    }),
});
