import { useRouter } from "next/router";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { api } from "@/utils/api";
import { UsageStats } from "../../../layout/UsageStatistics";
import type { NextPage } from "next";

const AiStatistics: NextPage = () => {
  const router = useRouter();
  const aiId = router.query.aiid as string;

  // Queries
  const { data, isLoading } = api.data.getStatistics.useQuery(
    { id: aiId, type: "ai" },
    { staleTime: Infinity, enabled: aiId !== undefined }
  );
  const ai = data?.info;
  const usage = data?.usage;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = ai && "username" in ai ? ai.username : "";

  // Prevent unauthorized access
  if (isLoading) {
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
};

export default AiStatistics;
