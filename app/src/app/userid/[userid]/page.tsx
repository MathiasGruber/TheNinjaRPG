import PublicUserComponent from "@/layout/PublicUser";

export default async function PublicProfile(props: { params: Promise<{ userid: string }> }) {
  const params = await props.params;
  return (
    <PublicUserComponent
      userId={params.userid}
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
