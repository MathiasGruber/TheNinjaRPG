import React from "react";

interface StatusBarProps {
  title: string;
  tooltip?: string;
  showText?: boolean;
  color: string;
  current: number;
  total: number;
}

const StatusBar: React.FC<StatusBarProps> = (props) => {
  return (
    <div className="group relative mt-2 flex-row">
      {props.showText && (
        <div>
          {props.title} ({props.current} / {props.total})
        </div>
      )}

      <div className={`h-3 w-full border-2 border-black`}>
        <div
          className={`h-full w-3/6 ${props.color}`}
          style={{
            width: ((props.current / props.total) * 100).toString() + "%",
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
