"use client";
import { use } from "react";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { aiText } from "@/layout/seoTexts";
import { api } from "@/app/_trpc/client";
import { useUserData } from "@/utils/UserContext";
import { UsageStats } from "@/layout/UsageStatistics";

export default function ManualAIsStatistcs(props: {
  params: Promise<{ aiid: string }>;
}) {
  const params = use(props.params);
  const aiId = params.aiid;

  // Queries
  const { data: userData } = useUserData();
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
    <>
      {!userData && ai && "username" in ai && (
        <ContentBox title="AI Profile" subtitle={ai.username} back_href="/manual/ai">
          {aiText(ai.username)}
        </ContentBox>
      )}
      <ContentBox
        title={`AI: ${name}`}
        subtitle={`Total battles: ${total}`}
        initialBreak={!userData && !!ai}
        back_href={userData ? "/manual/ai" : undefined}
      >
        {usage && <UsageStats usage={usage} />}
      </ContentBox>
    </>
  );
}
