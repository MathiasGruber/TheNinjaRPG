import React, { useEffect, useRef } from "react";
import { Chart as ChartJS } from "chart.js/auto";
import { groupBy } from "@/utils/grouping";

interface LevelStatsProps {
  levelDistribution: {
    level: number;
    count: number;
  }[];
  title: string;
  xaxis: string;
}

export const LevelStats: React.FC<LevelStatsProps> = (props) => {
  const { levelDistribution, title, xaxis } = props;
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = chartRef?.current?.getContext("2d");
    if (ctx) {
      const labels = levelDistribution.map((x) => x.level) ?? [];
      const counts = levelDistribution.map((x) => x.count) ?? [];
      const myChart = new ChartJS(ctx, {
        type: "bar",
        options: {
          scales: {
            x: {
              type: "linear",
              ticks: { stepSize: 1 },
              title: { display: true, text: xaxis },
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
              label: title,
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
  }, [levelDistribution, title, xaxis]);

  return (
    <div className="relative w-[99%]">
      <canvas ref={chartRef} id="baseUsage"></canvas>
    </div>
  );
};

interface UsageStatsProps {
  usage: {
    battleWon: number;
    battleType: "ARENA" | "COMBAT" | "SPARRING";
    count: number;
  }[];
}
type UsageDataset = { data: number[]; label: string };
type Label = string | null | (string | null)[];
type Groups = Map<Label, { battleWon: number; count: number }[]>;

export const UsageStats: React.FC<UsageStatsProps> = (props) => {
  const { usage } = props;
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = chartRef?.current?.getContext("2d");
    if (ctx) {
      const groups = groupBy(usage, "battleType");
      const labels = Array.from(groups.keys());
      const myChart = getUsageChart(ctx, groups, labels);
      return () => {
        myChart.destroy();
      };
    }
  }, [usage]);

  return (
    <div className="relative w-[99%]">
      <canvas ref={chartRef} id="baseUsage"></canvas>
    </div>
  );
};

export const getUsageChart = (
  ctx: CanvasRenderingContext2D,
  groups: Groups,
  labels: Label[]
) => {
  // Calculate the statistics
  const won: UsageDataset = { data: [], label: "Won" };
  const lost: UsageDataset = { data: [], label: "Lost" };
  const fled: UsageDataset = { data: [], label: "Fled" };
  groups.forEach((group) => {
    const wins = group.find((x) => x.battleWon === 1)?.count ?? 0;
    const losses = group.find((x) => x.battleWon === 0)?.count ?? 0;
    const flees = group.find((x) => x.battleWon === 2)?.count ?? 0;
    const total = wins + losses + flees ? wins + losses + flees : 1;
    won.data.push((100 * wins) / total);
    lost.data.push((100 * losses) / total);
    fled.data.push((100 * flees) / total);
  });

  const myChart = new ChartJS(ctx, {
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
      labels: labels,
      datasets: [won, lost, fled],
    },
  });
  return myChart;
};
