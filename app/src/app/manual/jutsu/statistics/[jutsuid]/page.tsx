"use client";;
import { use } from "react";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/app/_trpc/client";
import { UsageStats, LevelStats } from "@/layout/UsageStatistics";

export default function JutsuStatistics(props: { params: Promise<{ jutsuid: string }> }) {
  const params = use(props.params);
  const jutsuId = params.jutsuid;

  // Queries
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: jutsuId, type: "jutsu" },
    { enabled: !!jutsuId },
  );
  const jutsu = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const levelDistribution = data?.levelDistribution;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = jutsu && "name" in jutsu ? jutsu.name : "";

  // Prevent unauthorized access
  if (isPending) return <Loader explanation="Loading data" />;

  // Show panel controls
  return (
    <>
      <ContentBox
        title={`Jutsu: ${name}`}
        subtitle={`Total users: ${totalUsers}`}
        back_href="/manual/jutsu"
      >
        {levelDistribution && (
          <LevelStats
            levelDistribution={levelDistribution}
            title="#Users vs. Jutsu Level"
            xaxis="Jutsu Level"
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
