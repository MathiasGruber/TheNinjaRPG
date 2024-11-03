"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { UsageStats } from "@/layout/UsageStatistics";

export default function ManualAIsStatistcs({ params }: { params: { aiid: string } }) {
  const aiId = params.aiid;

  // Queries
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: aiId, type: "ai" },
    { enabled: !!aiId },
  );
  const ai = data?.info;
  const usage = data?.usage;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = ai && "username" in ai ? ai.username : "";

  // Prevent unauthorized access
  if (isPending) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <ContentBox
      title={`AI: ${name}`}
      subtitle={`Total battles: ${total}`}
      back_href="/manual/ai"
    >
      {usage && <UsageStats usage={usage} />}
    </ContentBox>
  );
}
