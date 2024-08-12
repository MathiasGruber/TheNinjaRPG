import PublicUserComponent from "@/layout/PublicUser";

export default function PublicProfile({ params }: { params: { userid: string } }) {
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
    />
  );
}
