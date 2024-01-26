import React, { useEffect, useState, useRef } from "react";
import ContentBox from "@/layout/ContentBox";
import Toggle from "@/layout/Toggle";
import { useRequiredUserData } from "@/utils/UserContext";
import { Chart as ChartJS } from "chart.js/auto";

interface StrengthWeaknessesProps {}

const StrengthWeaknesses: React.FC<StrengthWeaknessesProps> = () => {
  // State
  const { data: userData } = useRequiredUserData();
  const [showGraphs, setShowGraphs] = useState<boolean>(true);
  const statsChart = useRef<HTMLCanvasElement>(null);
  const generalsChart = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const statsCtx = statsChart?.current?.getContext("2d");
    const generalsCtx = generalsChart?.current?.getContext("2d");
    if (statsCtx && generalsCtx && userData) {
      // Update stats chart
      const myStatsChart = new ChartJS(statsCtx, {
        type: "radar",
        options: {
          maintainAspectRatio: false,
          responsive: true,
          elements: {
            line: {
              borderWidth: 3,
            },
          },
          scales: {
            r: {
              angleLines: { display: true },
              suggestedMin: 0,
            },
          },
          plugins: {
            legend: {
              display: false,
            },
          },
        },
        data: {
          labels: [
            "Nin Off",
            "Gen Off",
            "Tai Off",
            "Buki Off",
            "Nin Def",
            "Gen Def",
            "Tai Def",
            "Buki Def",
          ],
          datasets: [
            {
              label: "Offense",
              data: [
                userData.ninjutsuOffence,
                userData.genjutsuOffence,
                userData.taijutsuOffence,
                userData.bukijutsuOffence,
                userData.ninjutsuDefence,
                userData.genjutsuDefence,
                userData.taijutsuDefence,
                userData.bukijutsuDefence,
              ],
              fill: true,
              backgroundColor: "rgba(255, 99, 132, 0.2)",
              borderColor: "rgb(255, 99, 132)",
              pointBackgroundColor: "rgb(255, 99, 132)",
              pointBorderColor: "#fff",
              pointHoverBackgroundColor: "#fff",
              pointHoverBorderColor: "rgb(255, 99, 132)",
            },
          ],
        },
      });
      // Update stats chart
      const myGeneralsChart = new ChartJS(generalsCtx, {
        type: "bar",
        options: {
          maintainAspectRatio: false,
          responsive: true,
          aspectRatio: 1,
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
          labels: ["Strength", "Speed", "Intelligence", "Willpower"],
          datasets: [
            {
              data: [
                userData.strength,
                userData.speed,
                userData.intelligence,
                userData.willpower,
              ],
              backgroundColor: [
                "rgba(255, 99, 132, 0.2)",
                "rgba(255, 159, 64, 0.2)",
                "rgba(255, 205, 86, 0.2)",
                "rgba(75, 192, 192, 0.2)",
              ],
              borderColor: [
                "rgb(255, 99, 132)",
                "rgb(255, 159, 64)",
                "rgb(255, 205, 86)",
                "rgb(75, 192, 192)",
              ],
              borderWidth: 1,
            },
          ],
        },
      });
      // Remove on unmount
      return () => {
        myStatsChart.destroy();
        myGeneralsChart.destroy();
      };
    }
  }, [userData, showGraphs]);

  return (
    <ContentBox
      title="Strengths & Weaknesses"
      subtitle="Current stats for your character"
      topRightContent={
        <Toggle
          value={showGraphs}
          setShowActive={setShowGraphs}
          labelActive="Graphs"
          labelInactive="Numbers"
        />
      }
      initialBreak={true}
    >
      {showGraphs && (
        <div className="grid grid-cols-1 sm:grid-cols-2 pt-3">
          <div>
            <div className="relative w-[99%] p-3">
              <canvas ref={generalsChart} id="generalsChart"></canvas>
            </div>
          </div>
          <div>
            <div className="relative w-[99%]">
              <canvas ref={statsChart} id="statsChart"></canvas>
            </div>
          </div>
        </div>
      )}
      {!showGraphs && userData && (
        <>
          <div className="grid grid-cols-2  gap-2">
            <div>
              <b>Offences</b>
              <p>Ninjutsu offence: {userData.ninjutsuOffence.toFixed(2)}</p>
              <p>Genjutsu offence: {userData.genjutsuOffence.toFixed(2)}</p>
              <p>Taijutsu offence: {userData.taijutsuOffence.toFixed(2)}</p>
              <p>Bukijutsu offence: {userData.bukijutsuOffence.toFixed(2)}</p>
            </div>

            <div>
              <b>Defences</b>
              <p>Ninjutsu defence: {userData.ninjutsuDefence.toFixed(2)}</p>
              <p>Genjutsu defence: {userData.genjutsuDefence.toFixed(2)}</p>
              <p>Taijutsu defence: {userData.taijutsuDefence.toFixed(2)}</p>
              <p>Bukijutsu defence: {userData.bukijutsuDefence.toFixed(2)}</p>
            </div>
          </div>
          <div className="pt-2">
            <b>Generals</b>
            <div className="grid grid-cols-2">
              <div>
                <p>Strength: {userData.strength.toFixed(2)}</p>
                <p>Intelligence: {userData.intelligence.toFixed(2)}</p>
              </div>
              <div>
                <p>Willpower: {userData.willpower.toFixed(2)}</p>
                <p>Speed: {userData.speed.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </ContentBox>
  );
};

export default StrengthWeaknesses;
