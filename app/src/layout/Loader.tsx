import React from "react";
import Image from "next/image";
import { IMG_LOADER } from "@/drizzle/constants";

interface LoaderProps {
  explanation?: string;
  noPadding?: boolean;
  size?: number;
}

const Loader: React.FC<LoaderProps> = (props) => {
  return (
    <div className={`flex flex-col  items-center ${props.noPadding ? "" : "py-2"}`}>
      <Image
        alt="Loader Icon"
        src={IMG_LOADER}
        className="animate-spin"
        width={props.size ?? 30}
        height={props.size ?? 30}
        unoptimized
      />
      <div>{props.explanation}</div>
    </div>
  );
};

export default Loader;
