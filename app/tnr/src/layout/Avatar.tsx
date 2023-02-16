import React from "react";
import Image from "next/image";
import Loader from "./Loader";

interface AvatarImageProps {
  href?: string | null;
  alt: string;
  size: number;
  priority?: boolean;
}

const AvatarImage: React.FC<AvatarImageProps> = (props) => {
  if (!props.href) {
    return <Loader explanation="Creating avatar..." />;
  } else {
    return (
      <Image
        className="m-auto w-5/6 rounded-2xl border-2 border-black hover:border-amber-500 hover:opacity-80"
        src={props.href}
        alt={props.alt + " AvatarImage"}
        width={props.size}
        height={props.size}
        priority={props.priority}
      />
    );
  }
};

export default AvatarImage;
