import React, { useRef, useEffect, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart2, Bug } from "lucide-react";
import { Chart as ChartJS, registerables } from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";
import { Button } from "@/components/ui/button";

// Register all Chart.js components
ChartJS.register(...registerables);

interface BloodlineStatisticsProps {
  trigger?: React.ReactNode;
}

export const BloodlineStatistics: React.FC<BloodlineStatisticsProps> = ({
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const { data, isLoading } = api.bloodline.getNaturalRollStatistics.useQuery(
    undefined,
    { enabled: open },
  );

  // Chart reference
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Chart instance for cleanup
  const chartInstance = useRef<ChartJS | null>(null);

  // Format data for chart - calculate percentages
  const chartData = !data
    ? []
    : (() => {
        // Calculate total including "none" entries but excluding "H" rank
        const filteredData = Object.entries(data).filter(([rank]) => rank !== "H");
        const total = filteredData.reduce((sum, [_, count]) => sum + Number(count), 0);

        // Include all entries including "none" but excluding "H" rank
        return filteredData
          .map(([rank, count]) => ({
            rank,
            count: Number(count),
            percentage: total > 0 ? (Number(count) / total) * 100 : 0,
          }))
          .sort((a, b) => {
            // Sort by rank: S, A, B, C, D, none (at the end)
            const rankOrder: Record<string, number> = {
              S: 0,
              A: 1,
              B: 2,
              C: 3,
              D: 4,
              none: 5,
            };
            return (rankOrder[a.rank] ?? 999) - (rankOrder[b.rank] ?? 999);
          });
      })();

  // Function to create or update the chart
  const createOrUpdateChart = () => {
    if (!data || !chartRef.current || chartData.length === 0) {
      return;
    }

    // Clean up previous chart instance
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const ctx = chartRef.current.getContext("2d");
    if (ctx) {
      // Prepare chart data
      const chartConfig: ChartData = {
        labels: chartData.map((item) =>
          item.rank === "none" ? "No Bloodline" : `${item.rank}-Rank`,
        ),
        datasets: [
          {
            label: "Percentage",
            data: chartData.map((item) => parseFloat(item.percentage.toFixed(2))),
            backgroundColor: chartData.map((item) => {
              // Color based on rank
              switch (item.rank) {
                case "S":
                  return "rgba(255, 99, 132, 0.7)"; // Red
                case "A":
                  return "rgba(255, 159, 64, 0.7)"; // Orange
                case "B":
                  return "rgba(255, 205, 86, 0.7)"; // Yellow
                case "C":
                  return "rgba(75, 192, 192, 0.7)"; // Green
                case "D":
                  return "rgba(54, 162, 235, 0.7)"; // Blue
                case "none":
                  return "rgba(201, 203, 207, 0.7)"; // Grey
                default:
                  return "rgba(201, 203, 207, 0.7)"; // Grey
              }
            }),
            borderColor: chartData.map((item) => {
              // Border color based on rank
              switch (item.rank) {
                case "S":
                  return "rgb(255, 99, 132)";
                case "A":
                  return "rgb(255, 159, 64)";
                case "B":
                  return "rgb(255, 205, 86)";
                case "C":
                  return "rgb(75, 192, 192)";
                case "D":
                  return "rgb(54, 162, 235)";
                case "none":
                  return "rgb(201, 203, 207)";
                default:
                  return "rgb(201, 203, 207)";
              }
            }),
            borderWidth: 1,
          },
        ],
      };

      // Chart options
      const options: ChartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const index = context.dataIndex;
                const item = chartData[index];
                if (!item) return "";
                return [
                  `Percentage: ${item.percentage.toFixed(2)}%`,
                  `Count: ${item.count}`,
                ];
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Percentage (%)",
            },
            ticks: {
              callback: function (value) {
                return value + "%";
              },
            },
          },
        },
      };

      try {
        // Create new chart
        chartInstance.current = new ChartJS(ctx, {
          type: "bar",
          data: chartConfig,
          options: options,
        });
        console.log("Chart created successfully");
      } catch (error) {
        console.error("Error creating chart:", error);
      }
    }
  };

  // Effect to handle chart creation/destruction based on data changes
  useEffect(() => {
    if (open && data) {
      // Small delay to ensure the canvas is visible
      const timer = setTimeout(() => {
        createOrUpdateChart();
      }, 200); // Increased delay to ensure DOM is ready
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, []);

  // Calculate total rolls including "none" entries
  const totalRolls = data
    ? Object.values(data).reduce((sum, count) => sum + Number(count), 0)
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <BarChart2 className="h-6 w-6 hover:text-orange-500 cursor-pointer" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[350px] md:w-[450px]" align="end">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Bloodline Roll Statistics</h3>
              <p className="text-sm text-muted-foreground">
                Distribution of natural bloodline rolls by rank
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDebug(!showDebug)}
              className="h-8 w-8"
            >
              <Bug className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <p>Loading statistics...</p>
            </div>
          ) : !data || totalRolls === 0 ? (
            <div className="flex justify-center items-center h-40">
              <p className="text-center text-gray-500">
                No roll statistics available yet
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Total bloodline rolls:</span>
                  <span className="font-semibold">{totalRolls}</span>
                </div>

                {showDebug && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                    <p className="font-semibold">Raw Data:</p>
                    <pre>{JSON.stringify(data, null, 2)}</pre>
                    <p className="font-semibold mt-2">Processed Data:</p>
                    <pre>{JSON.stringify(chartData, null, 2)}</pre>
                  </div>
                )}
              </div>

              <div className="w-full aspect-square">
                <canvas ref={chartRef} />
              </div>

              <div className="text-xs text-gray-500 italic">
                Statistics based on all natural bloodline rolls in the game
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
