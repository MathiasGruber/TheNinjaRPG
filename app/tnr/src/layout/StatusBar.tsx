import React from "react";
import { UserStatus } from "@prisma/client";

interface StatusBarProps {
  title: string;
  tooltip?: string;
  showText?: boolean;
  status?: UserStatus;
  color: "bg-red-500" | "bg-blue-500" | "bg-green-500";
  current: number;
  total: number;
}

const StatusBar: React.FC<StatusBarProps> = (props) => {
  // Colors & width, depending on battle status
  const isInBattle = props.status === UserStatus.BATTLE;
  let color: string = props.color;
  let width = (props.current / props.total) * 100;

  if (isInBattle) {
    color = `bg-gradient-to-r from-orange-400 to-orange-100 background-animate`;
    width = 100;
  }
  return (
    <div className="group relative mt-2 flex-row">
      {props.showText && !isInBattle && (
        <div>
          {props.title} ({props.current} / {props.total})
        </div>
      )}

      <div className={`h-3 w-full border-2 border-black`}>
        <div
          className={`h-full w-3/6 ${color}`}
          style={{
            width: width.toString() + "%",
          }}
        ></div>
      </div>
      {props.tooltip && (
        <span className="absolute z-50 rounded-md bg-gray-800 p-2 text-sm font-bold text-gray-100 opacity-0 transition-opacity group-hover:opacity-100">
          {props.tooltip}
        </span>
      )}
    </div>
  );
};

export default StatusBar;
