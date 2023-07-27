import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { api } from "../../../utils/api";
import type { NextPage } from "next";

import { Chart as ChartJS } from "chart.js/auto";

const JutsuStatistics: NextPage = () => {
  const router = useRouter();
  const jutsuId = router.query.jutsuid as string;

  // Canvas refs
  const baseUsageRef = useRef<HTMLCanvasElement>(null);

  // Queries
  const { data, isLoading } = api.jutsu.getStatistics.useQuery(
    { id: jutsuId },
    { staleTime: Infinity, enabled: jutsuId !== undefined }
  );
  const jutsu = data?.jutsu;
  const totalUsers = data?.totalUsers ?? 0;
  const levelDistribution = data?.levelDistribution;

  // Draw charts
  useEffect(() => {
    const ctx = baseUsageRef?.current?.getContext("2d");
    if (ctx) {
      const labels = levelDistribution?.map((x) => x.level) ?? [];
      const counts = levelDistribution?.map((x) => x.count) ?? [];
      const myChart = new ChartJS(ctx, {
        type: "bar",
        options: {
          scales: {
            x: {
              type: "linear",
              ticks: { stepSize: 1 },
              title: {
                display: true,
                text: "Jutsu Level",
              },
            },
            y: {
              type: "linear",
              ticks: { stepSize: 1 },
              title: {
                display: true,
                text: "#Users",
              },
            },
          },
        },
        data: {
          labels: labels,
          datasets: [
            {
              data: counts,
              label: "#Users vs. Jutsu Level",
              borderColor: "#3e95cd",
              backgroundColor: "#7bb6dd",
            },
          ],
        },
      });
      return () => {
        myChart.destroy();
      };
    }
  }, [levelDistribution]);

  // Prevent unauthorized access
  if (isLoading) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <>
      <ContentBox
        title={`Jutsu: ${jutsu?.name ?? ""}`}
        subtitle={`Total users: ${totalUsers}`}
        back_href="/manual/jutsus"
      >
        <div className="relative w-[99%]">
          <canvas ref={baseUsageRef} id="baseUsage"></canvas>
        </div>
      </ContentBox>
      <ContentBox
        title="Usage Statistics"
        subtitle={`Battle data: ${jutsu?.name ?? ""}`}
        initialBreak={true}
      >
        Information on jutsu usage statistics
      </ContentBox>
    </>
  );
};

export default JutsuStatistics;
