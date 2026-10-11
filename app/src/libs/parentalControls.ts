import type { ParentalControl } from "@/drizzle/schema";

/** Communication rules without PIN credentials or attempt counters. */
export type CommunicationPolicy = Pick<
  ParentalControl,
  "userId" | "enabled" | "tavernDisabled" | "privateMessages" | "approvedUserIds"
>;
export const TAVERN_PARENTAL_MESSAGE =
  "Tavern access is disabled by parental controls.";
export const PRIVATE_PARENTAL_MESSAGE =
  "Parental controls allow private messages only with approved players.";

/**
 * Returns the first restriction imposed by any participating account, or null.
 * Include retained message senders in participantIds when checking existing history.
 */
export const privateConversationRestriction = (
  policies: CommunicationPolicy[],
  participantIds: string[],
) => {
  for (const policy of policies) {
    if (!policy.enabled || !participantIds.includes(policy.userId)) continue;
    const others = participantIds.filter((id) => id !== policy.userId);
    if (policy.privateMessages === "NONE" && others.length > 0) {
      return "Private messages are disabled by parental controls. Support tickets remain available.";
    }
    if (
      policy.privateMessages === "APPROVED" &&
      others.some((id) => !policy.approvedUserIds.includes(id))
    ) {
      return PRIVATE_PARENTAL_MESSAGE;
    }
  }
  return null;
};

/**
 * Returns the reader's tavern or private-history restriction, or null.
 * Private history includes current members and retained senders; support is exempt.
 */
export const conversationReadRestriction = (
  policy: CommunicationPolicy | undefined,
  convo: { isPublic: boolean; isStaffAvailable: boolean; users: { userId: string }[] },
  senderIds: string[] = [],
) => {
  if (!policy?.enabled || convo.isStaffAvailable) return null;
  if (convo.isPublic) return policy.tavernDisabled ? TAVERN_PARENTAL_MESSAGE : null;
  return privateConversationRestriction(
    [policy],
    [...convo.users.map((u) => u.userId), ...senderIds],
  );
};
