import { useState, useEffect, useRef } from "react";
import { groupBy } from "@/utils/grouping";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import Button from "@/layout/Button";
import ExportGraph from "@/layout/ExportGraph";
import { ArrowDownOnSquareIcon } from "@heroicons/react/24/outline";
import { getUsageChart } from "@/layout/UsageStatistics";
import { api } from "@/utils/api";
import type { BattleTypes } from "@/drizzle/constants";
import type { NextPage } from "next";

const ManualJutsus: NextPage = () => {
  // State
  const [filter, setFilter] = useState<(typeof BattleTypes)[number]>("COMBAT");

  // Reference for the chart
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Queries
  const { data, isLoading } = api.data.getJutsuBalanceStatistics.useQuery(
    { battleType: filter },
    { staleTime: Infinity },
  );

  useEffect(() => {
    const ctx = chartRef?.current?.getContext("2d");
    if (ctx && data) {
      const groups = groupBy(data, "name");
      const labels = Array.from(groups).map(([name, entries]) => [
        name,
        `Count: ${entries.reduce((acc, curr) => acc + curr.count, 0)}`,
      ]);
      // const labels = Array.from(groups.keys());
      const myChart = getUsageChart(ctx, groups, labels);
      myChart.resize(1000, groups.size * 60);
      return () => {
        myChart.destroy();
      };
    }
  }, [data]);

  return (
    <>
      <ContentBox
        title="Jutsu Balance"
        subtitle="Data from last 7 days"
        back_href="/manual/jutsus"
        topRightContent={
          <NavTabs
            current={filter}
            options={["ARENA", "COMBAT"]}
            setValue={setFilter}
          />
        }
      >
        Here we aim to give an overview of jutsu usage & win-statistics, so as to make
        it transparent if any jutsu or combination of jutsus is over/under-powered and
        in need of balance adjustment.
        {isLoading && <Loader explanation="Loading data" />}
        <div className="relative w-[99%]">
          <canvas ref={chartRef} id="baseUsage"></canvas>
        </div>
        {chartRef.current !== null && (
          <ExportGraph canvas={chartRef.current} filename="jutsu_balance" />
        )}
      </ContentBox>
    </>
  );
};

export default ManualJutsus;
