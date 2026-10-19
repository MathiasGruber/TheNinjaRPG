import { after } from "next/server";
import { isRaidChatConversationId } from "@/libs/raids";
import type { DrizzleClient } from "@/server/db";
import { isPushEnabled, sendPushToUsers } from "@/server/utils/push";
import { privateMessage } from "./messages";

/** Call only after the message and membership writes have completed. */
export const notifyPrivateConversation = (
  client: DrizzleClient,
  info: {
    conversationId: string;
    isPublic: boolean;
    senderId: string;
    authorId: string;
    recipientIds: string[];
  },
) => {
  if (
    info.isPublic ||
    isRaidChatConversationId(info.conversationId) ||
    !isPushEnabled()
  )
    return;
  const recipients = [...new Set(info.recipientIds)].filter(
    (id) => id && id !== info.senderId && id !== info.authorId,
  );
  if (!recipients.length) return;
  // Keep device queries and provider latency off the message response, while retaining
  // the invocation until delivery finishes. The fan-out honours social opt-outs.
  after(() => sendPushToUsers(client, recipients, privateMessage(info.conversationId)));
};
