import React from "react";
import Image from "next/image";
import { ItemRarities } from "../../drizzle/schema";
import type { ItemRarity } from "../../drizzle/schema";

interface ContentImageProps {
  image: string;
  alt: string;
  rarity?: ItemRarity;
  className: string;
  onClick?: () => void;
}

const ContentImage: React.FC<ContentImageProps> = (props) => {
  const drawBackground =
    props.rarity && Object.values(ItemRarities).includes(props.rarity);

  return (
    <>
      {drawBackground && props.rarity && (
        <Image
          className={
            props.className +
            "relative bottom-0 left-0 right-0 top-0 rounded-xl border-2"
          }
          src={`/rarity/${props.rarity}.webp`}
          alt={props.alt}
          width={125}
          height={125}
          priority={true}
          onClick={props.onClick}
        />
      )}
      <Image
        className={`${props.className} ${
          drawBackground ? "absolute left-1/2 -translate-x-1/2 " : "relative left-0"
        } bottom-0 right-0 top-0 rounded-xl border-2`}
        src={props.image}
        alt={props.alt}
        width={125}
        height={125}
        priority={true}
        onClick={props.onClick}
      />
    </>
  );
};

export default ContentImage;
