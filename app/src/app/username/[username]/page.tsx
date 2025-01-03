import PublicUserComponent from "@/layout/PublicUser";
import { userData } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { drizzleDB } from "@/server/db";

export default async function PublicProfile(props: {
  params: Promise<{ username: string }>;
}) {
  const params = await props.params;
  const user = await drizzleDB.query.userData.findFirst({
    where: eq(userData.username, decodeURIComponent(params.username)),
  });
  return (
    <PublicUserComponent
      userId={user?.userId || params.username}
      title="Users"
      back_href="/users"
      showRecruited
      showStudents
      showBadges
      showNindo
      showReports
      showTransactions
      showActionLogs
      showTrainingLogs
      showCombatLogs
      showMarriages
    />
  );
}
