import { auth } from "@clerk/nextjs/server";
import { fetchUser } from "@/routers/profile";
import { drizzleDB } from "@/server/db";
import { canChangeContent } from "@/utils/permissions";

export const checkContentAiAuth = async () => {
  // Auth guard
  const { userId } = auth();
  if (!userId) return "Not authenticated";

  // User guard
  const user = await fetchUser(drizzleDB, userId);
  if (!canChangeContent(user.role)) {
    throw new Error("You are not allowed to change content");
  }
};
