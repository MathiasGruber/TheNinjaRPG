"use client";

import React from "react";
import Image from "next/image";
import { cn } from "src/libs/shadui";

interface AvatarImageProps {
  href?: string | null;
  userId?: string;
  alt?: string;
  size: number;
  priority?: boolean;
  hover_effect?: boolean;
  refetchUserData?: boolean;
  className?: string;
}

const AvatarImage: React.FC<AvatarImageProps> = (props) => {
  // If no href, show loader, otherwise show avatar
  if (!props.href) {
    return (
      <div
        className={`relative m-auto w-5/6 aspect-square rounded-2xl border-2 border-black bg-linear-to-r from-slate-500 to-slate-400 background-animate opacity-20`}
      ></div>
    );
  } else {
    const base =
      "relative max-w-80 m-auto w-5/6 aspect-square rounded-2xl border-2 border-black";
    const hover = props.hover_effect ? "hover:border-amber-500 hover:opacity-80" : "";
    return (
      <Image
        className={cn(base, hover, props.className)}
        src={props.href}
        alt={(props.alt || "unknown") + " AvatarImage"}
        width={props.size}
        height={props.size}
        priority={props.priority}
        loading={props.priority ? "eager" : "lazy"}
        unoptimized={true}
      />
    );
  }
};

export default AvatarImage;
