import { useRouter } from "next/router";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { api } from "../../../utils/api";
import type { NextPage } from "next";

const BloodlineStatistics: NextPage = () => {
  const router = useRouter();
  const bloodlineId = router.query.bloodlineid as string;

  // Queries
  const { data, isLoading } = api.bloodline.get.useQuery(
    { id: bloodlineId },
    { staleTime: Infinity, enabled: bloodlineId !== undefined }
  );

  // Prevent unauthorized access
  if (isLoading) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <ContentBox
      title="Bloodline Statistics"
      subtitle={data?.name ?? "Loading..."}
      back_href="/manual/bloodlines"
    >
      Statistics on Bloodlines
    </ContentBox>
  );
};

export default BloodlineStatistics;
