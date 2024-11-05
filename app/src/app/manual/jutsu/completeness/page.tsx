"use client";

import React, { useState, useRef, useEffect } from "react";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import { api } from "@/app/_trpc/client";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import WordCloud from "@/layout/Wordcloud";
import { Chart as ChartJS } from "chart.js/auto";
import type { ArrayElement } from "@/utils/typeutils";

export default function ManualJutsuBalance() {
  // State
  const availFilters = ["Incomplete", "Diversity"];
  const [filter, setFilter] = useState<(typeof availFilters)[number]>("Incomplete");

  // Queries
  const { data, isPending } = api.jutsu.getAll.useQuery({ limit: 500 }, {});
  const allJutsus = data?.data;

  // Table processing
  const processed = allJutsus
    ?.map((jutsu) => {
      // Checks
      const effects = jutsu.effects.length === 0 ? 1 : 0;
      const shortDescription = jutsu.description.length < 50 ? 1 : 0;
      const battleDescription = jutsu.battleDescription.length < 50 ? 1 : 0;
      const missingGraphic = !jutsu.effects.some(
        (e) =>
          e.appearAnimation ||
          e.disappearAnimation ||
          e.staticAnimation ||
          e.staticAssetPath,
      )
        ? 1
        : 0;
      const total = effects + shortDescription + battleDescription + missingGraphic;
      // Return summary
      return {
        name: jutsu.name,
        description: jutsu.description,
        missingGraphic: missingGraphic ? "N/A" : "No",
        battleDescription: battleDescription ? "Yes" : "No",
        effects: effects ? "N/A" : "No",
        shortDescription: shortDescription ? "Yes" : "No",
        total: total,
      };
    })
    .filter((b) => b.total > 0)
    .sort((a, b) => b.total - a.total);

  // Table
  type Row = ArrayElement<typeof processed>;
  const columns: ColumnDefinitionType<Row, keyof Row>[] = [
    { key: "name", header: "Jutsu", type: "string" },
    { key: "effects", header: "N/A Effects", type: "string" },
    { key: "missingGraphic", header: "N/A Graphic", type: "string" },
    { key: "shortDescription", header: "Short Desc", type: "string" },
    { key: "battleDescription", header: "Short Battle Desc", type: "string" },
  ];

  // Counts per classification
  const classCounts = allJutsus?.reduce<Record<string, number>>((acc, curr) => {
    const key = curr.statClassification || "N/A";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Counts per rank
  const rankCounts = allJutsus?.reduce<Record<string, number>>((acc, curr) => {
    const key = curr.jutsuRank || "N/A";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Wordclouds
  const allDescriptions = allJutsus?.map((b) => b.description).join(" ");
  const allTitles = allJutsus?.map((b) => b.name).join(" ");

  return (
    <>
      <ContentBox
        title="Completeness"
        subtitle="Missing information etc."
        back_href="/manual/jutsu"
        padding={false}
        topRightContent={
          <NavTabs current={filter} options={availFilters} setValue={setFilter} />
        }
      >
        <p className="p-3">
          The aim of this overview is to highlight any missing information in content,
          such that we can ensure that content is complete & diverse.
        </p>
        {isPending && <Loader explanation="Loading data" />}
        {!isPending && filter === "Incomplete" && (
          <Table data={processed} columns={columns} />
        )}
        {!isPending && filter === "Diversity" && (
          <div className="p-3">
            <p className="bold text-xl">Description Wordcloud</p>
            <WordCloud text={allDescriptions} />
            <p className="bold text-xl">Title Wordcloud</p>
            <WordCloud text={allTitles} />
            <p className="bold text-xl">Classifications</p>
            <CountsChart data={classCounts} />
            <p className="bold text-xl">Ranking</p>
            <CountsChart data={rankCounts} />
          </div>
        )}
      </ContentBox>
    </>
  );
}

interface CountsChartProps {
  data: Record<string, number> | undefined;
}

const CountsChart: React.FC<CountsChartProps> = (props) => {
  const classChart = useRef<HTMLCanvasElement>(null);
  const data = Object.entries(props.data || {}).map(([text, value]) => ({
    text,
    value,
  }));
  const values = data.map((d) => d.value);
  const labels = data.map((d) => d.text);
  useEffect(() => {
    const classCtx = classChart?.current?.getContext("2d");
    if (classCtx) {
      const myClassChart = new ChartJS(classCtx, {
        type: "bar",
        options: {
          maintainAspectRatio: false,
          responsive: true,
          aspectRatio: 1.1,
          scales: {
            y: {
              beginAtZero: true,
            },
          },
          plugins: {
            legend: {
              display: false,
            },
          },
        },
        data: {
          labels: labels,
          datasets: [
            {
              data: values,
              borderWidth: 1,
            },
          ],
        },
      });
      // Remove on unmount
      return () => {
        myClassChart.destroy();
      };
    }
  }, [labels, values]);

  return (
    <div className="relative w-[99%] p-3">
      <canvas ref={classChart} id="classCounts"></canvas>
    </div>
  );
};
