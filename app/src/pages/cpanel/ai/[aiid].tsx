import { useRouter } from "next/router";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { api } from "../../../utils/api";
import type { NextPage } from "next";

const AIStatistics: NextPage = () => {
  const router = useRouter();
  const aiId = router.query.aiid as string;

  // Queries
  const { data, isLoading } = api.profile.getAi.useQuery(
    { userId: aiId },
    { staleTime: Infinity, enabled: aiId !== undefined }
  );

  // Prevent unauthorized access
  if (isLoading) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <ContentBox
      title="AI Statistics"
      subtitle={data?.username ?? "Loading..."}
      back_href="/manual/ai"
    >
      Statistics on AI
    </ContentBox>
  );
};

export default AIStatistics;
