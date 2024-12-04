"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import DistributeStatsForm from "@/layout/StatsDistributionForm";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";

export default function AssignExperience() {
  // State
  const {
    data: userData,
    notifications,
    updateUser,
    updateNotifications,
  } = useRequiredUserData();

  // Mutations
  const { mutate: updateStats } = api.profile.useUnusedExperiencePoints.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      if (result.success && result.data) {
        await updateUser(result.data);
        if (result.data.earnedExperience <= 0) {
          await updateNotifications(
            notifications?.filter((n) => !n.name.includes("Unassigned Stats")),
          );
        }
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
