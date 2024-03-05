import { useRouter } from "next/router";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { UsageStats, LevelStats } from "@/layout/UsageStatistics";
import type { NextPage } from "next";

const JutsuStatistics: NextPage = () => {
  const router = useRouter();
  const jutsuId = router.query.jutsuid as string;

  // Queries
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: jutsuId, type: "jutsu" },
    { staleTime: Infinity, enabled: jutsuId !== undefined },
  );
  const jutsu = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const levelDistribution = data?.levelDistribution;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = jutsu && "name" in jutsu ? jutsu.name : "";

  // Prevent unauthorized access
  if (isPending) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <>
      <ContentBox
        title={`Jutsu: ${name}`}
        subtitle={`Total users: ${totalUsers}`}
        back_href="/manual/jutsus"
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
};

export default JutsuStatistics;
