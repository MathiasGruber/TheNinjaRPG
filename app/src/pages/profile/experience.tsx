import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import DistributeStatsForm from "@/layout/StatsDistributionForm";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import type { NextPage } from "next";

const AssignExperience: NextPage = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Mutations
  const { mutate: updateStats } = api.profile.useUnusedExperiencePoints.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetchUser();
      }
    },
  });

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Show component
  return (
    <ContentBox
      title="Assign Experience Points"
      subtitle={`You have ${userData.earnedExperience} unused experience points`}
      back_href="/profile"
    >
      <DistributeStatsForm
        userData={userData}
        onAccept={updateStats}
        availableStats={userData.earnedExperience}
      />
    </ContentBox>
  );
};

export default AssignExperience;
