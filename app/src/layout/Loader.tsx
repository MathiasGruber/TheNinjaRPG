import React from "react";
import Image from "next/image";

interface LoaderProps {
  explanation?: string;
  noPadding?: boolean;
}

const Loader: React.FC<LoaderProps> = (props) => {
  return (
    <div className={`flex flex-col  items-center ${props.noPadding ? "" : "py-2"}`}>
      <Image alt="Loader Icon" src="/images/star_loader.gif" width={30} height={30} />
      <p>{props.explanation}</p>
    </div>
  );
};

export default Loader;
