import React, { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { secondsPassed } from "@/utils/time";
import type { UserStatus } from "@/drizzle/schema";

interface StatusBarProps {
  title: string;
  regen?: number;
  lastRegenAt?: Date | null;
  tooltip?: string;
  showText?: boolean;
  status?: UserStatus;
  timeDiff?: number;
  color: "bg-red-500" | "bg-blue-500" | "bg-green-500" | "bg-yellow-500";
  current?: number;
  total?: number;
}

/**
 * Calculate current state of the bar based on regen
 */
const calcCurrent = (
  start?: number,
  total?: number,
  status?: UserStatus,
  regen?: number,
  regenAt?: Date | null,
  timeDiff?: number,
) => {
  const end = total ?? 100;
  let current = start ?? 0;
  if (status === "BATTLE" || start === undefined) {
    current = end;
  } else if (
    regen &&
    status &&
    regenAt &&
    ["AWAKE", "ASLEEP", "TRAVEL"].includes(status)
  ) {
    const minutes = secondsPassed(regenAt, timeDiff) / 60;
    if (regen > 0) {
      current = Math.min(end, start + regen * minutes);
    } else {
      current = Math.max(0, start + regen * minutes);
    }
  }
  const width = (current / end) * 100;
  return { current, width };
};

const StatusBar: React.FC<StatusBarProps> = (props) => {
  // Destructure props
  const { regen, lastRegenAt, timeDiff } = props;
  const { showText, title, current, total, status } = props;

  // Is the user in battle?
  const isInBattle = props.status === "BATTLE";
  const isAwake = props.status === "AWAKE";

  // Calculate initial state
  const [state, setState] = useState(
    calcCurrent(current, total, status, regen, lastRegenAt, timeDiff),
  );

  // Color for the bars
  const color =
    isInBattle || current === undefined || total === undefined
      ? `bg-gradient-to-r from-slate-500 to-slate-400 background-animate opacity-20`
      : props.color;

  // Updating the bars based on regen
  useEffect(() => {
    const interval = setInterval(() => {
      if (regen && current && total) {
        if (
          (regen > 0 && (state.current < total || current < total)) ||
          (regen < 0 && (state.current > 0 || current > 0))
        ) {
          setState(calcCurrent(current, total, status, regen, lastRegenAt, timeDiff));
        }
      }
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [isAwake, regen, lastRegenAt, current, total, status, state, timeDiff]);

  return (
    <div className="group relative mt-2 flex-row">
      {showText && !isInBattle && (
        <div>
          {title} ({Math.round(state.current)} / {total || "??"})
        </div>
      )}

      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger className="w-full">
            <div className={`h-3 w-full border-2 border-black`}>
              <div
                className={`h-full w-3/6 ${color}`}
                style={{
                  width: state.width.toString() + "%",
                }}
              ></div>
            </div>
          </TooltipTrigger>
          {props.tooltip && <TooltipContent>{props.tooltip}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default StatusBar;
