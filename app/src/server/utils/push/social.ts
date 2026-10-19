import { isRaidChatConversationId } from "@/libs/raids";
import type { DrizzleClient } from "@/server/db";
import { deferPushToUsers } from "./defer";
import { conversationMention, privateMessage } from "./messages";

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
  if (info.isPublic || isRaidChatConversationId(info.conversationId)) return;
  const recipients = [...new Set(info.recipientIds)].filter(
    (id) => id && id !== info.senderId && id !== info.authorId,
  );
  if (!recipients.length) return;
  // Keep device queries and provider latency off the message response, while retaining
  // the invocation until delivery finishes. The fan-out honours social opt-outs.
  deferPushToUsers(client, recipients, privateMessage(info.conversationId));
};

/** Recipients must already have passed conversation, blacklist and parental checks. */
export const notifyConversationMentions = (
  client: DrizzleClient,
  info: {
    conversationId: string;
    isPublic: boolean;
    senderId: string;
    authorId: string;
    recipientIds: string[];
  },
) => {
  // Private members already receive the inbox alert; named outsiders must not learn
  // that a private thread exists, even if the existing websocket ping allows them.
  if (!info.isPublic || isRaidChatConversationId(info.conversationId)) return;
  const recipients = info.recipientIds.filter(
    (id) => id !== info.senderId && id !== info.authorId,
  );
  deferPushToUsers(client, recipients, conversationMention(info.conversationId));
};
