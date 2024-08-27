import React from "react";
import Image from "next/image";
import { isInArray } from "@/utils/array";
import { Grab } from "lucide-react";
import { Zap } from "lucide-react";
import { BrainCog } from "lucide-react";
import { Sword } from "lucide-react";
import { LoaderPinwheel } from "lucide-react";
import { SquarePlus } from "lucide-react";
import { BicepsFlexed } from "lucide-react";
import { Brain } from "lucide-react";
import { Flame } from "lucide-react";
import { Footprints } from "lucide-react";
import { cn } from "src/libs/shadui";

import { GeneralTypes, StatTypes, ElementNames } from "@/drizzle/constants";
import type { GeneralType, StatType, ElementName } from "@/drizzle/constants";

interface ElementImageProps {
  element: GeneralType | StatType | ElementName | "All";
  hoverText?: string;
  className?: string;
}

const ElementImage: React.FC<ElementImageProps> = (props) => {
  // Destructure
  const { element, hoverText } = props;

  // Decide what image to show
  let image: React.ReactNode = null;
  if (isInArray(element, ElementNames)) {
    image = (
      <Image
        src={`/elements/${element.toLocaleLowerCase()}.webp`}
        width={32}
        height={32}
        alt={element}
        className={props.className}
      />
    );
  } else if (isInArray(element, [...StatTypes, ...GeneralTypes, "All"])) {
    const base = "rounded-full p-1 text-white";
    switch (element) {
      case "Highest":
        return (
          <SquarePlus
            strokeWidth={3}
            className={cn(base, props.className, "bg-stone-500")}
          />
        );
        break;
      case "Taijutsu":
        image = (
          <Grab strokeWidth={3} className={cn(base, props.className, "bg-green-600")} />
        );
        break;
      case "Ninjutsu":
        image = (
          <Zap strokeWidth={3} className={cn(base, props.className, "bg-amber-500")} />
        );
        break;
      case "Genjutsu":
        image = (
          <BrainCog
            strokeWidth={3}
            className={cn(base, props.className, "bg-purple-600")}
          />
        );
        break;
      case "Bukijutsu":
        image = (
          <Sword strokeWidth={3} className={cn(base, props.className, "bg-red-600")} />
        );
        break;
      case "Strength":
        image = (
          <BicepsFlexed
            strokeWidth={3}
            className={cn(base, props.className, "bg-blue-800")}
          />
        );
        break;
      case "Intelligence":
        image = (
          <Brain strokeWidth={3} className={cn(base, props.className, "bg-teal-600")} />
        );
        break;
      case "Speed":
        image = (
          <Footprints
            strokeWidth={3}
            className={cn(base, props.className, "bg-cyan-600")}
          />
        );
        break;
      case "Willpower":
        image = (
          <Flame
            strokeWidth={3}
            className={cn(base, props.className, "bg-orange-600")}
          />
        );
        break;
      case "All":
        image = (
          <LoaderPinwheel
            className={cn(props.className, "bg-gray-600 rounded-full p-1 text-white")}
          />
        );
        break;
    }
  }

  return (
    <div key={element} className="relative">
      {image}
      <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 rounded-md bg-gray-800 p-2 text-sm font-bold text-gray-100 opacity-0 transition-opacity hover:opacity-100 whitespace-nowrap">
        {hoverText || element}
      </span>
    </div>
  );
};

export default ElementImage;
