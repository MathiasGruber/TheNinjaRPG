"use client";

import React, { useEffect, useState, useRef } from "react";
import ContentBox from "@/layout/ContentBox";
import Toggle from "@/components/control/Toggle";
import ElementImage from "@/layout/ElementImage";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { capUserStats } from "@/libs/profile";
import { useRequiredUserData } from "@/utils/UserContext";
import { Chart as ChartJS } from "chart.js/auto";
import { getUserElements } from "@/validators/user";

const StrengthWeaknesses: React.FC = () => {
  // State
  const { data: userData } = useRequiredUserData();
  const [showGraphs, setShowGraphs] = useState<boolean | undefined>(undefined);
  const statsChart = useRef<HTMLCanvasElement>(null);
  const generalsChart = useRef<HTMLCanvasElement>(null);

  // Implement stats cap
  if (userData) capUserStats(userData);

  useEffect(() => {
    const statsCtx = statsChart?.current?.getContext("2d");
    const generalsCtx = generalsChart?.current?.getContext("2d");
    if (statsCtx && generalsCtx && userData) {
      // Update stats chart
      const localTheme = localStorage.getItem("theme");
      ChartJS.defaults.color = localTheme === "dark" ? "#FFFFFF" : "#000000";
      const myStatsChart = new ChartJS(statsCtx, {
        type: "radar",
        options: {
          maintainAspectRatio: false,
          aspectRatio: 1.4,
          responsive: true,
          elements: {
            line: {
              borderWidth: 3,
            },
          },
          scales: {
            r: {
              angleLines: { display: true },
              ticks: { backdropColor: "rgba(99, 255, 132, 0.0)" },
              suggestedMin: 0,
              backgroundColor: "rgba(99, 255, 132, 0.2)",
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
              label: "Value",
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
                "rgba(255, 99, 132, 0.5)",
                "rgba(255, 159, 64, 0.5)",
                "rgba(255, 205, 86, 0.5)",
                "rgba(75, 192, 192, 0.5)",
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

  // Calculate user elements
  const userElements = getUserElements(userData);

  return (
    <ContentBox
      title="Strengths & Weaknesses"
      subtitle="Current stats for your character"
      topRightContent={
        <div className="flex flex-row gap-2">
          <Toggle
            id="toggle-strength-weaknesses"
            value={showGraphs}
            setShowActive={setShowGraphs}
            labelActive="Graphs"
            labelInactive="Numbers"
          />
          <Popover>
            <PopoverTrigger>
              <CircleHelp className="h-6 w-6" />
            </PopoverTrigger>
            <PopoverContent>
              <div className="flex flex-col gap-2 text-xs">
                <div>
                  <p className="font-bold">Stats Explained</p>
                  <p className="italic">
                    Your stats influence how strong your character is overall
                  </p>
                </div>
                <ul>
                  <li>
                    <b>Strength:</b> physical strength
                  </li>
                  <li>
                    <b>Intelligence:</b> mental strength
                  </li>
                  <li>
                    <b>Speed:</b> movement speed
                  </li>
                  <li>
                    <b>Willpower:</b> mental resistance
                  </li>
                </ul>
                <ul>
                  <li>
                    <b>Ninjutsu:</b> Ninja techniques infused with chakra
                  </li>
                  <li>
                    <b>Genjutsu:</b> Illusions and mental techniques
                  </li>
                  <li>
                    <b>Taijutsu:</b> Physical combat techniques
                  </li>
                  <li>
                    <b>Bukijutsu:</b> Proficiency with weapons
                  </li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
      initialBreak={true}
    >
      {showGraphs && (
        <div className="grid grid-cols-1 sm:grid-cols-2 pt-3">
          <div>
            <p className="font-bold">Generals</p>
            <div className="relative w-[99%] p-3">
              <canvas ref={generalsChart} id="generalsChart"></canvas>
            </div>
          </div>
          <div>
            <p className="font-bold">Strengths</p>
            <div className="relative w-[99%]">
              <canvas ref={statsChart} id="statsChart"></canvas>
            </div>
            <p className="font-bold pt-2">Elemental Proficiency</p>
            <div className="flex flex-row w-full justify-center gap-2 pt-2">
              {userElements.map((element) => (
                <ElementImage key={element} element={element} className="w-14" />
              ))}
            </div>
            {userElements.length === 0 && (
              <>
                <p>- 1st element at Genin</p>
                <p>- 2nd element at Chunin</p>
              </>
            )}
          </div>
        </div>
      )}
      {!showGraphs && userData && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <b>Offences</b>
              <div className="flex flex-row items-center">
                <ElementImage element="Ninjutsu" className="w-6 h-6 mr-1 mb-1" />
                Ninjutsu offence: {userData.ninjutsuOffence.toFixed(2)}
              </div>
              <div className="flex flex-row items-center">
                <ElementImage element="Genjutsu" className="w-6 h-6 mr-1 mb-1" />
                Genjutsu offence: {userData.genjutsuOffence.toFixed(2)}
              </div>
              <div className="flex flex-row items-center">
                <ElementImage element="Taijutsu" className="w-6 h-6 mr-1 mb-1" />
                Taijutsu offence: {userData.taijutsuOffence.toFixed(2)}
              </div>
              <div className="flex flex-row items-center">
                <ElementImage element="Bukijutsu" className="w-6 h-6 mr-1 mb-1" />
                Bukijutsu offence: {userData.bukijutsuOffence.toFixed(2)}
              </div>
            </div>

            <div>
              <b>Defences</b>
              <div className="flex flex-row items-center">
                <ElementImage element="Ninjutsu" className="w-6 h-6 mr-1 mb-1" />
                Ninjutsu defence: {userData.ninjutsuDefence.toFixed(2)}
              </div>
              <div className="flex flex-row items-center">
                <ElementImage element="Genjutsu" className="w-6 h-6 mr-1 mb-1" />
                Genjutsu defence: {userData.genjutsuDefence.toFixed(2)}
              </div>
              <div className="flex flex-row items-center">
                <ElementImage element="Taijutsu" className="w-6 h-6 mr-1 mb-1" />
                Taijutsu defence: {userData.taijutsuDefence.toFixed(2)}
              </div>
              <div className="flex flex-row items-center">
                <ElementImage element="Bukijutsu" className="w-6 h-6 mr-1 mb-1" />
                Bukijutsu defence: {userData.bukijutsuDefence.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="pt-2">
            <div className="grid grid-cols-2">
              <div>
                <b>Generals</b>
                <div className="flex flex-row items-center">
                  <ElementImage element="Strength" className="w-6 h-6 mr-1 mb-1" />
                  Strength: {userData.strength.toFixed(2)}
                </div>
                <div className="flex flex-row items-center">
                  <ElementImage element="Intelligence" className="w-6 h-6 mr-1 mb-1" />
                  Intelligence: {userData.intelligence.toFixed(2)}
                </div>
                <div className="flex flex-row items-center">
                  <ElementImage element="Willpower" className="w-6 h-6 mr-1 mb-1" />
                  Willpower: {userData.willpower.toFixed(2)}
                </div>
                <div className="flex flex-row items-center">
                  <ElementImage element="Speed" className="w-6 h-6 mr-1 mb-1" />
                  Speed: {userData.speed.toFixed(2)}
                </div>
              </div>
              <div>
                <b>Elemental Proficiency</b>
                <div className="grid grid-cols-2 gap-1">
                  {userElements.map((element) => (
                    <div key={element} className="flex flex-row pt-1">
                      <ElementImage element={element} className="w-6" />
                      <p className="pl-2">{element}</p>
                    </div>
                  ))}
                </div>
                {userElements.length === 0 && (
                  <>
                    <p>- 1st element at Genin</p>
                    <p>- 2nd element at Chunin</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </ContentBox>
  );
};

export default StrengthWeaknesses;
