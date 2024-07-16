"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { UsageStats, LevelStats } from "@/layout/UsageStatistics";

export default function BloodlineStatistics({
  params,
}: {
  params: { bloodlineid: string };
}) {
  const bloodlineId = params.bloodlineid;

  // Queries
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: bloodlineId, type: "bloodline" },
    { staleTime: Infinity, enabled: bloodlineId !== undefined },
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
      <ContentBox
        title={`Bloodline: ${name}`}
        subtitle={`Total users: ${totalUsers}`}
        back_href="/manual/bloodline"
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
