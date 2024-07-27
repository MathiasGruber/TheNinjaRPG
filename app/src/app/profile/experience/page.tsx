"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import DistributeStatsForm from "@/layout/StatsDistributionForm";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";

export default function AssignExperience() {
  // State
  const { data: userData } = useRequiredUserData();

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: updateStats } = api.profile.useUnusedExperiencePoints.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
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
}
