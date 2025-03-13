import sanitize from "@/utils/sanitize";

/**
 * Get the new reactions for a comment
 * @param oldReactions - The old reactions
 * @param emoji - The emoji to add
 * @param username - The username to add
 * @returns The new reactions
 */
export const getNewReactions = (
  oldReactions: Record<string, string[]>,
  emoji: string,
  username: string,
) => {
  // Sanitize
  const sanitizedEmoji = sanitize(emoji);
  // Guard
  if (sanitizedEmoji === "") return oldReactions;
  if (sanitizedEmoji.length > 10) return oldReactions;
  // Update
  const newReactions = { ...oldReactions };
  if (newReactions[sanitizedEmoji]) {
    if (newReactions[sanitizedEmoji]?.includes(username)) {
      const updated = newReactions[sanitizedEmoji]?.filter((u) => u !== username);
      if (updated && updated.length > 0) {
        newReactions[sanitizedEmoji] = updated;
      } else {
        delete newReactions[sanitizedEmoji];
      }
    } else {
      newReactions[sanitizedEmoji] = [...newReactions[sanitizedEmoji], username];
    }
  } else {
    newReactions[sanitizedEmoji] = [username];
  }
  return newReactions;
};
