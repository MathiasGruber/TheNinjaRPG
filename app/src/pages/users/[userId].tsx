import { useRouter } from "next/router";
import PublicUserComponent from "@/layout/PublicUser";
import type { NextPage } from "next";

const PublicProfile: NextPage = () => {
  const router = useRouter();
  const userId = router.query.userId as string;

  return (
    <PublicUserComponent
      userId={userId}
      title="Users"
      back_href="/users"
      showRecruited
      showStudents
      showBadges
      showNindo
      showReports
      showTransactions
    />
  );
};

export default PublicProfile;
