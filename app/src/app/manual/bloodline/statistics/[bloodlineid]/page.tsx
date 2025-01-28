"use client";
import { use } from "react";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { bloodlineText } from "@/layout/seoTexts";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { UsageStats, LevelStats } from "@/layout/UsageStatistics";

export default function BloodlineStatistics(props: {
  params: Promise<{ bloodlineid: string }>;
}) {
  const params = use(props.params);
  const bloodlineId = params.bloodlineid;

  // Queries
  const { data: userData } = useUserData();
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: bloodlineId, type: "bloodline" },
    { enabled: !!bloodlineId },
  );
  const bloodline = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const levelDistribution = data?.levelDistribution;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = bloodline && "name" in bloodline ? bloodline.name : "";

  // Prevent unauthorized access
  if (isPending) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <>
      {!userData && bloodline && "name" in bloodline && (
        <ContentBox
          title="Bloodline Statistics"
          subtitle={bloodline.name}
          back_href="/manual/jutsu"
        >
          {bloodlineText(bloodline.name)}
        </ContentBox>
      )}
      <ContentBox
        title={`Bloodline: ${name}`}
        subtitle={`Total users: ${totalUsers}`}
        initialBreak={!userData && !!bloodline}
        back_href={userData ? "/manual/bloodline" : undefined}
      >
        {levelDistribution && (
          <LevelStats
            levelDistribution={levelDistribution}
            title="#Users vs. User Level"
            xaxis="User Level"
          />
        )}
      </ContentBox>
      <ContentBox
        title="Usage Statistics"
        subtitle={`Total battles: ${total}`}
        initialBreak={true}
      >
        {usage && <UsageStats usage={usage} />}
      </ContentBox>
    </>
  );
}
