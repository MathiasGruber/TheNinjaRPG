import React, { useRef, useEffect } from "react";
import NextImage from "next/image";
import Loader from "@/layout/Loader";
import { cn } from "src/libs/shadui";
import {
  ItemRarities,
  IMG_RARITY_RARE,
  IMG_RARITY_LEGENDARY,
  IMG_RARITY_EPIC,
  IMG_RARITY_COMMON,
} from "@/drizzle/constants";
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
  const tailwindSize = "max-w-40 max-h-40 w-full h-full";

  useEffect(() => {
    if (props.image && props.speed && props.frames) {
      let currentFrame = 0;
      let frameCount = 0;
      let timerId = 0;
      const spritesheet = new Image();
      const ctx = imgRef?.current?.getContext("2d");
      spritesheet.src = props.image;
      spritesheet.onload = function () {
        init();
      };
      function init() {
        timerId = window.requestAnimationFrame(step);
      }
      function step() {
        if (ctx && imgRef?.current && props.frames && props.speed) {
          frameCount++;
          if (frameCount < 10) {
            timerId = window.requestAnimationFrame(step);
            return;
          }
          frameCount = 0;
          const h = spritesheet.height / props.frames;
          const w = spritesheet.width;
          ctx.clearRect(0, 0, pixels, pixels);
          ctx.drawImage(spritesheet, 0, currentFrame * h, w, h, 0, 0, pixels, pixels);
          currentFrame++;
          if (currentFrame >= props.frames) currentFrame = 0;
          timerId = window.requestAnimationFrame(step);
        }
      }
      return () => {
        window.cancelAnimationFrame(timerId);
        spritesheet.onload = null;
      };
    }
  }, [props.image, props.speed, props.frames]);

  // Image is either an animation or static image
  let img: null | React.ReactNode = null;
  if (props.image) {
    if (props.speed && props.frames) {
      img = (
        <div
          className="flex flex-row items-center justify-center h-full"
          onClick={props.onClick}
        >
          <canvas
            ref={imgRef}
            id={`img-${props.alt}`}
            width={pixels}
            height={pixels}
            className={cn(tailwindSize)}
          ></canvas>
        </div>
      );
    } else {
      img = (
        <NextImage
          className={cn(
            "w-full h-full aspect-square",
            props.roundFull ? "rounded-full" : "rounded-xl",
            props.className,
          )}
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
        <div className={cn(tailwindSize)}>
          <NextImage
            className={cn(
              "relative bottom-0 left-0 right-0 top-0",
              props.roundFull ? "rounded-full" : "rounded-xl",
              props.hideBorder ? "" : "border-2",
              props.className,
            )}
            src={getRarityBackground(props.rarity)}
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
            "bottom-0 right-0 top-0",
            props.roundFull ? "rounded-full" : "rounded-xl",
            props.hideBorder ? "" : "border-2",
            "aspect-square w-full",
            tailwindSize,
            props.className,
          )}
        >
          {img}
        </div>
      )}
    </>
  );
};

export default ContentImage;

export const getRarityBackground = (rarity: ItemRarity) => {
  switch (rarity) {
    case "COMMON":
      return IMG_RARITY_COMMON;
    case "EPIC":
      return IMG_RARITY_EPIC;
    case "LEGENDARY":
      return IMG_RARITY_LEGENDARY;
    case "RARE":
      return IMG_RARITY_RARE;
    default:
      return "";
  }
};
