import { useRouter } from "next/router";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { api } from "../../../utils/api";
import type { NextPage } from "next";

const JutsuStatistics: NextPage = () => {
  const router = useRouter();
  const jutsuId = router.query.jutsuid as string;

  // Queries
  const { data, isLoading } = api.jutsu.get.useQuery(
    { id: jutsuId },
    { staleTime: Infinity, enabled: jutsuId !== undefined }
  );

  // Prevent unauthorized access
  if (isLoading) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <ContentBox
      title="Jutsu Statistics"
      subtitle={data?.name ?? "Loading..."}
      back_href="/manual/jutsus"
    >
      Statistics on Jutsu
    </ContentBox>
  );
};

export default JutsuStatistics;
