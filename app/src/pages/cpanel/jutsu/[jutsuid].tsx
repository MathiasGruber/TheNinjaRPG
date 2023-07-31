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
  const battleUsageRef = useRef<HTMLCanvasElement>(null);

  // Queries
  const { data, isLoading } = api.jutsu.getStatistics.useQuery(
    { id: jutsuId },
    { staleTime: Infinity, enabled: jutsuId !== undefined }
  );
  const jutsu = data?.jutsu;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const levelDistribution = data?.levelDistribution;

  // Calc battle usage
  const wins = usage?.find((x) => x.battleWon === 1)?.count ?? 0;
  const losses = usage?.find((x) => x.battleWon === 0)?.count ?? 0;
  const flees = usage?.find((x) => x.battleWon === 2)?.count ?? 0;
  const total = wins + losses + flees ? wins + losses + flees : 1;

  useEffect(() => {
    const ctx1 = baseUsageRef?.current?.getContext("2d");
    const ctx2 = battleUsageRef?.current?.getContext("2d");
    if (ctx1 && ctx2) {
      // Draw battle usage
      const myChart2 = new ChartJS(ctx2, {
        type: "bar",
        options: {
          responsive: true,
          indexAxis: "y",
          scales: {
            x: {
              stacked: true,
              title: { display: true, text: "Change of Outcome [%]" },
            },
            y: {
              stacked: true,
              title: { display: false },
            },
          },
        },
        data: {
          labels: [""],
          datasets: [
            { data: [(100 * wins) / total], label: "Won" },
            { data: [(100 * losses) / total], label: "Lost" },
            { data: [(100 * flees) / total], label: "Fled" },
          ],
        },
      });
      // Draw base charts
      const labels = levelDistribution?.map((x) => x.level) ?? [];
      const counts = levelDistribution?.map((x) => x.count) ?? [];
      const myChart1 = new ChartJS(ctx1, {
        type: "bar",
        options: {
          scales: {
            x: {
              type: "linear",
              ticks: { stepSize: 1 },
              title: { display: true, text: "Jutsu Level" },
            },
            y: {
              type: "linear",
              ticks: { stepSize: 1 },
              title: { display: true, text: "#Users" },
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
        myChart1.destroy();
        myChart2.destroy();
      };
    }
  }, [levelDistribution, wins, losses, flees, total]);

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
        subtitle={`Total battles: ${total}`}
        initialBreak={true}
      >
        <div className="relative w-[99%]">
          <canvas ref={battleUsageRef} id="battleUsage"></canvas>
        </div>
      </ContentBox>
    </>
  );
};

export default JutsuStatistics;
