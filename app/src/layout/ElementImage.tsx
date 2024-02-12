import React from "react";
import Image from "next/image";
import type { ElementName } from "@/drizzle/constants";

interface ElementImageProps {
  element: ElementName;
  className?: string;
}

const ElementImage: React.FC<ElementImageProps> = (props) => {
  return (
    <Image
      src={`/elements/${props.element.toLocaleLowerCase()}.webp`}
      width={32}
      height={32}
      alt={props.element}
      className={props.className}
    />
  );
};

export default ElementImage;
