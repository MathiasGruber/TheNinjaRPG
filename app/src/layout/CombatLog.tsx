import React, { useEffect, useRef } from "react";
import { api } from "@/utils/api";
import { Chart as ChartJS, LinearScale, PointElement } from "chart.js/auto";
import { getUnique } from "@/utils/grouping";
import ExportGraph from "@/layout/ExportGraph";
import zoomPlugin from "chartjs-plugin-zoom";
import ChartJSDragDataPlugin from "chartjs-plugin-dragdata";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import { ForceDirectedGraphController, EdgeLine } from "chartjs-chart-graph";
import type { ScriptableContext } from "chart.js/auto";

// register controller in chart.js and ensure the defaults are set
ChartJS.register(
  ForceDirectedGraphController,
  EdgeLine,
  LinearScale,
  PointElement,
  ChartJSDragDataPlugin,
  zoomPlugin,
);

interface CombatLogProps {
  userId: string;
}
const CombatLog: React.FC<CombatLogProps> = (props) => {
  // State
  const { userId } = props;
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Queries
  const { data } = api.combat.getBattleHistory.useQuery(
    { combatTypes: ["COMBAT"], userId: props.userId },
    { staleTime: Infinity },
  );

  // Wrangle data a bit
  const validData = data?.filter((x) => x.attacker && x.defender) || [];
  const users = validData.flatMap((x) => [x.attacker, x.defender]).filter((x) => x);
  const selectedUser = users.find((x) => x?.userId === props.userId);
  const selectedUsername = selectedUser?.username || "unknown";
  const uniqueUsers = getUnique(users, "username").map((u) => {
    const nBattles = validData.filter(
      (e) =>
        (e.attackedId === userId && e.defenderId === u.userId) ||
        (e.attackedId === u.userId && e.defenderId === userId),
    ).length;
    return {
      id: u.username,
      battles: nBattles,
      info: u.userId !== userId && `#${selectedUsername} vs ${u.username}: ${nBattles}`,
      ...u,
    };
  });
  type User = (typeof uniqueUsers)[number];

  const plotData = {
    nodes: uniqueUsers,
    links: validData.map((u) => ({
      source: u.attacker?.username || "unknown",
      target: u.defender?.username || "unknown",
      value:
        validData.filter(
          (x) =>
            (u.attackedId === x.attackedId && u.defenderId === x.defenderId) ||
            (u.defenderId === x.defenderId && u.attackedId === x.attackedId),
        ).length + 1,
    })),
  };

  /**
   * Draw Avatars
   * @param info
   * @returns
   */
  const getPointStyle = (info: ScriptableContext<"forceDirectedGraph">) => {
    const canvas = document.createElement("canvas");
    const user = info.raw as User;
    const [size, radius, x, y] = [user.userId === userId ? 50 : 30, 15, 0, 0];
    canvas.height = size;
    canvas.width = size;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + size - radius, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
    ctx.lineTo(x + size, y + size - radius);
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    ctx.lineTo(x + radius, y + size);
    ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.clip();
    const image = new Image(size, size);
    image.src = user.avatar || IMG_AVATAR_DEFAULT;
    ctx?.drawImage(image, 0, 0, size, size);
    return canvas;
  };

  useEffect(() => {
    const ctx = chartRef?.current?.getContext("2d");
    if (ctx && uniqueUsers.length > 0) {
      const myChart = new ChartJS(ctx, {
        type: "forceDirectedGraph",
        data: {
          labels: plotData.nodes.map((d) => d.id),
          datasets: [
            {
              pointBackgroundColor: "lightgrey",
              pointRadius: 50,
              pointHoverRadius: 50,
              data: plotData.nodes,
              edges: plotData.links,
            },
          ],
        },
        options: {
          elements: {
            point: {
              pointStyle: getPointStyle,
            },
          },

          layout: {
            autoPadding: false,
            padding: {
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (context) {
                  const user = context.raw as User;
                  return [user.username || "", user.info || ""];
                },
              },
            },
            legend: {
              display: false,
            },
            zoom: {
              pan: {
                enabled: true,
              },
              zoom: {
                wheel: {
                  enabled: true,
                },
                pinch: {
                  enabled: true,
                },
                mode: "xy",
              },
            },
          },
        },
      });
      return () => {
        myChart.destroy();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotData]);

  // Render
  return (
    <div className="relative w-[99%]">
      <canvas ref={chartRef} id="baseUsage"></canvas>
      {chartRef.current !== null && (
        <ExportGraph canvas={chartRef.current} filename="level_distribution" />
      )}
    </div>
  );
};

export default CombatLog;
