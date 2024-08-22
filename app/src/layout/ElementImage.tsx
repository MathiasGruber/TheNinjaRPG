import React from "react";
import Image from "next/image";
import type { ElementName } from "@/drizzle/constants";

interface ElementImageProps {
  element: ElementName;
  className?: string;
}

const ElementImage: React.FC<ElementImageProps> = (props) => {
  const { element } = props;
  return (
    <div key={element} className="relative">
      <Image
        src={`/elements/${element.toLocaleLowerCase()}.webp`}
        width={32}
        height={32}
        alt={element}
        className={props.className}
      />
      <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 rounded-md bg-gray-800 p-2 text-sm font-bold text-gray-100 opacity-0 transition-opacity hover:opacity-100">
        {element}
      </span>
    </div>
  );
};

export default ElementImage;
