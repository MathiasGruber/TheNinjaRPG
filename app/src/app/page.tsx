import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { drizzleDB } from "@/server/db";
import { userData } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import Welcome from "@/layout/Welcome";

export default async function Index() {
  // Get authentication status from Clerk
  const { userId } = await auth();

  // If user is not signed in, show welcome page
  if (!userId) {
    return <Welcome />;
  }

  // Check if user exists in our database
  const user = await drizzleDB.query.userData.findFirst({
    where: eq(userData.userId, userId),
    columns: { userId: true, username: true },
  });

  // If user doesn't exist in our database, redirect to registration
  if (!user) {
    redirect("/register");
  }

  // If user exists, redirect to profile
  redirect("/profile");
}
