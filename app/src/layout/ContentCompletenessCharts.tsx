"use client";

import { Chart as ChartJS } from "chart.js/auto";
import { useEffect, useRef } from "react";

export function CountsChart(props: CountsChartProps) {
  const classChartRef = useRef<HTMLCanvasElement>(null);
  const data = Object.entries(props.data || {}).map(([text, value]) => ({
    text,
    value,
  }));
  const values = data.map((d) => d.value);
  const labels = data.map((d) => d.text);
  useEffect(() => {
    const classCtx = classChartRef?.current?.getContext("2d");
    if (classCtx) {
      const myClassChart = new ChartJS(classCtx, {
        type: "bar",
        options: {
          maintainAspectRatio: false,
          responsive: true,
          aspectRatio: 1.1,
          scales: {
            x: {
              ticks: {
                maxRotation: 90,
                minRotation: 90,
                autoSkip: false,
              },
            },
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
      <canvas ref={classChartRef}></canvas>
    </div>
  );
}

export function StackedCountsChart(props: StackedCountsChartProps) {
  const stackedChartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stackedCtx = stackedChartRef?.current?.getContext("2d");
    if (stackedCtx && props.data) {
      const effectTypes = Object.keys(props.data);
      const calculations = Array.from(
        new Set(Object.values(props.data).flatMap((calcObj) => Object.keys(calcObj))),
      );

      const datasets = calculations.map((calculation, index) => {
        const colors = [
          "#FF6384",
          "#36A2EB",
          "#FFCE56",
          "#4BC0C0",
          "#9966FF",
          "#FF9F40",
        ];
        return {
          label: calculation,
          data: effectTypes.map(
            (effectType) => props.data?.[effectType]?.[calculation] || 0,
          ),
          backgroundColor: colors[index % colors.length],
          borderColor: colors[index % colors.length],
          borderWidth: 1,
        };
      });

      const myStackedChart = new ChartJS(stackedCtx, {
        type: "bar",
        options: {
          maintainAspectRatio: false,
          responsive: true,
          aspectRatio: 1.1,
          scales: {
            x: {
              ticks: {
                maxRotation: 90,
                minRotation: 90,
                autoSkip: false,
              },
              stacked: true,
            },
            y: {
              beginAtZero: true,
              stacked: true,
            },
          },
          plugins: {
            legend: {
              display: true,
            },
          },
        },
        data: {
          labels: effectTypes,
          datasets: datasets,
        },
      });

      // Remove on unmount
      return () => {
        myStackedChart.destroy();
      };
    }
  }, [props.data]);

  return (
    <div className="relative w-[99%] p-3">
      <canvas ref={stackedChartRef}></canvas>
    </div>
  );
}

interface CountsChartProps {
  data: Record<string, number> | undefined;
}

interface StackedCountsChartProps {
  data: Record<string, Record<string, number>> | undefined;
}
