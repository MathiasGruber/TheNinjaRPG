"use client";

import { useState, useEffect, useRef } from "react";
import { groupBy } from "@/utils/grouping";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import ExportGraph from "@/layout/ExportGraph";
import { getUsageChart } from "@/layout/UsageStatistics";
import { api } from "@/utils/api";
import type { BattleTypes } from "@/drizzle/constants";

export default function ManualItemsBalance() {
  // State
  const [filter, setFilter] = useState<(typeof BattleTypes)[number]>("COMBAT");

  // Reference for the chart
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Queries
  const { data, isPending } = api.data.getItemBalanceStatistics.useQuery(
    { battleType: filter },
    {},
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
      myChart.resize(500, groups.size * 60);
      return () => {
        myChart.destroy();
      };
    }
  }, [data]);

  return (
    <>
      <ContentBox
        title="Item Balance"
        subtitle="Data from last 7 days"
        back_href="/manual/item"
        topRightContent={
          <NavTabs
            current={filter}
            options={["ARENA", "COMBAT"]}
            setValue={setFilter}
          />
        }
      >
        Here we aim to give an overview of items usage & win-statistics, so as to make
        it transparent if any items or combination of itemss is over/under-powered and
        in need of balance adjustment.
        {isPending && <Loader explanation="Loading data" />}
        <div className="relative w-[99%]">
          <canvas ref={chartRef} id="baseUsage"></canvas>
        </div>
        {chartRef.current !== null && (
          <ExportGraph canvas={chartRef.current} filename="items_balance" />
        )}
      </ContentBox>
    </>
  );
}
