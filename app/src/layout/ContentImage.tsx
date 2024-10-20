import React, { useRef } from "react";
import NextImage from "next/image";
import Loader from "@/layout/Loader";
import { cn } from "src/libs/shadui";
import { ItemRarities } from "@/drizzle/constants";
import type { ItemRarity } from "@/drizzle/schema";

interface ContentImageProps {
  image?: string | null;
  alt: string;
  rarity?: ItemRarity;
  frames?: number;
  speed?: number;
  className: string;
  roundFull?: boolean;
  hideBorder?: boolean;
  onClick?: () => void;
}

const ContentImage: React.FC<ContentImageProps> = (props) => {
  // The image to show
  const imgRef = useRef<HTMLCanvasElement>(null);
  const pixels = 112;
  let img: null | React.ReactNode = null;
  if (props.image) {
    if (props.speed && props.frames) {
      img = (
        <div className="flex flex-row items-center justify-center h-full">
          <canvas
            ref={imgRef}
            id={`img-${props.alt}`}
            width={pixels}
            height={pixels}
            className="w-24 h-24"
          ></canvas>
        </div>
      );
      let currentFrame = 0;
      const spritesheet = new Image();
      const ctx = imgRef?.current?.getContext("2d");
      spritesheet.src = props.image;
      spritesheet.onload = function () {
        init();
      };
      function init() {
        window.requestAnimationFrame(step);
      }
      function step() {
        if (ctx && imgRef?.current && props.frames) {
          const h = spritesheet.height / props.frames;
          const w = spritesheet.width;
          ctx.clearRect(0, 0, pixels, pixels);
          ctx.drawImage(spritesheet, 0, currentFrame * h, w, h, 0, 0, pixels, pixels);
          currentFrame++;
          if (currentFrame >= props.frames) currentFrame = 0;
          window.requestAnimationFrame(step);
        }
      }
    } else {
      img = (
        <NextImage
          className={cn(props.className)}
          src={props.image}
          alt={props.alt}
          width={125}
          height={125}
          priority={true}
          onClick={props.onClick}
        />
      );
    }
  }

  // Derived properties
  const drawBackground =
    props.rarity && Object.values(ItemRarities).includes(props.rarity);

  // Return
  return (
    <>
      {drawBackground && props.rarity && (
        <div className="w-28 h-28">
          <NextImage
            className={cn(
              props.className,
              "relative bottom-0 left-0 right-0 top-0",
              props.roundFull ? "rounded-full" : "rounded-xl",
              props.hideBorder ? "" : "border-2",
            )}
            src={`/rarity/${props.rarity}.webp`}
            alt={props.alt}
            width={125}
            height={125}
            priority={true}
            onClick={props.onClick}
          />
        </div>
      )}
      {!props.image && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-0 right-0 top-0`}>
          <Loader explanation="Creating..." />
        </div>
      )}
      {props.image && (
        <div
          className={cn(
            drawBackground ? "absolute left-1/2 -translate-x-1/2 " : "relative left-0",
            "bottom-0 right-0 top-0 w-28 h-28",
            props.roundFull ? "rounded-full" : "rounded-xl",
            props.hideBorder ? "" : "border-2",
          )}
        >
          {img}
        </div>
      )}
    </>
  );
};

export default ContentImage;
