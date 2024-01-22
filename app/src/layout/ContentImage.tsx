import React from "react";
import Image from "next/image";
import Loader from "./Loader";
import { ItemRarities } from "../../drizzle/constants";
import type { ItemRarity } from "../../drizzle/schema";

interface ContentImageProps {
  image?: string | null;
  alt: string;
  rarity?: ItemRarity;
  className: string;
  roundFull?: boolean;
  hideBorder?: boolean;
  onClick?: () => void;
}

const ContentImage: React.FC<ContentImageProps> = (props) => {
  const drawBackground =
    props.rarity && Object.values(ItemRarities).includes(props.rarity);
  return (
    <>
      {drawBackground && props.rarity && (
        <Image
          className={`${props.className} relative bottom-0 left-0 right-0 top-0 ${
            props.roundFull ? "rounded-full" : "rounded-xl"
          } ${props.hideBorder ? "" : "border-2"}`}
          src={`/rarity/${props.rarity}.webp`}
          alt={props.alt}
          width={125}
          height={125}
          priority={true}
          onClick={props.onClick}
        />
      )}
      {!props.image && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-0 right-0 top-0`}>
          <Loader explanation="Creating..." />
        </div>
      )}
      {props.image && (
        <Image
          className={`${
            drawBackground ? "absolute left-1/2 -translate-x-1/2 " : "relative left-0"
          } bottom-0 right-0 top-0 ${props.roundFull ? "rounded-full" : "rounded-xl"} ${
            props.hideBorder ? "" : "border-2"
          } ${props.className}`}
          src={props.image}
          alt={props.alt}
          width={125}
          height={125}
          priority={true}
          onClick={props.onClick}
        />
      )}
    </>
  );
};

export default ContentImage;
