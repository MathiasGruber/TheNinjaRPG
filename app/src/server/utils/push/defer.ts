import { after } from "next/server";
import type { DrizzleClient } from "@/server/db";
import { isPushEnabled, sendPushToUsers } from "@/server/utils/push";
import type { PushMessage } from "./types";

/** Call after successful game writes; provider work must not delay the action. */
export const deferPushToUsers = (
  client: DrizzleClient,
  userIds: string[],
  message: PushMessage,
) => {
  const recipients = [...new Set(userIds)].filter(Boolean);
  if (!recipients.length || !isPushEnabled()) return;
  after(() => sendPushToUsers(client, recipients, message));
};
