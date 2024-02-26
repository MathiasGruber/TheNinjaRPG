import React, { useState, useEffect } from "react";
import Image from "next/image";
import Loader from "./Loader";
import { api } from "@/utils/api";
import { sleep } from "@/utils/time";

interface AvatarImageProps {
  href?: string | null;
  userId?: string;
  alt: string;
  size: number;
  priority?: boolean;
  hover_effect?: boolean;
  refetchUserData?: () => void;
}

const AvatarImage: React.FC<AvatarImageProps> = (props) => {
  // Placement of avatar
  const [href, setHref] = useState<string | null | undefined>(props.href);

  // Fetch avatar query
  const { mutate: checkAvatar } = api.avatar.checkAvatar.useMutation({
    onSuccess: async (data) => {
      if (data.url) {
        setHref(data.url);
        if (props.refetchUserData) {
          props.refetchUserData();
        }
      } else if (!href && props.userId) {
        await sleep(10000);
        checkAvatar({ userId: props.userId });
      }
    },
  });

  // If href is not provided, fetch avatar
  useEffect(() => {
    if (!href && props.userId) {
      checkAvatar({ userId: props.userId });
    }
    if (href !== props.href) {
      setHref(props.href);
    }
  }, [href, props.userId, props.href, checkAvatar]);

  // If no href, show loader, otherwise show avatar
  if (!href) {
    return <Loader explanation="Creating..." />;
  } else {
    return (
      <Image
        className={`relative m-auto w-5/6 aspect-square rounded-2xl border-2 border-black ${
          props.hover_effect ? "hover:border-amber-500 hover:opacity-80" : ""
        }`}
        src={href}
        alt={props.alt + " AvatarImage"}
        width={props.size}
        height={props.size}
        priority={props.priority}
        unoptimized={true}
      />
    );
  }
};

export default AvatarImage;
