import React from "react";
import { Activity } from "lucide-react";
import { RefreshCw } from "lucide-react";

const WebGlError: React.FC = () => {
  return (
    <div className="w-full min-h-96 flex flex-col items-center justify-center">
      <Activity className="w-40 h-40 p-3 m-3 bg-popover rounded-full animate-pulse" />
      <p>Error loading WebGL renderer.</p>
      <p>Please update your browser.</p>
      <p
        className="hover:text-orange-500 hover:cursor-pointer animate-pulse"
        onClick={() => location.reload()}
      >
        Refresh <RefreshCw className="w-5 h-5 inline" />
      </p>
    </div>
  );
};

export default WebGlError;
