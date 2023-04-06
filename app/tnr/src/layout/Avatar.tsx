import React, { useState, useEffect } from "react";
import Image from "next/image";
import Loader from "./Loader";

import { api } from "../utils/api";
import { show_toast } from "../libs/toast";

interface AvatarImageProps {
  href?: string | null;
  userId?: string;
  alt: string;
  size: number;
  priority?: boolean;
  hover_effect?: boolean;
}

const AvatarImage: React.FC<AvatarImageProps> = (props) => {
  // Placement of avatar
  const [href, setHref] = useState<string | null | undefined>(props.href);

  // Fetch avatar query
  const { mutate: checkAvatar } = api.avatar.checkAvatar.useMutation({
    onSuccess: (data) => {
      setHref(data.url);
    },
    onError: (error) => {
      show_toast("Error fetching avatar", error.message, "error");
    },
  });

  // If href is not provided, fetch avatar
  useEffect(() => {
    if (!props.href && props.userId) {
      checkAvatar({ userId: props.userId });
    }
  }, [props.href, props.userId, checkAvatar]);

  // If no href, show loader, otherwise show avatar
  if (!href) {
    return <Loader explanation="Creating avatar..." />;
  } else {
    return (
      <Image
        className={`relative m-auto w-5/6 rounded-2xl border-2 border-black ${
          props.hover_effect ? "hover:border-amber-500 hover:opacity-80" : ""
        }`}
        src={href}
        alt={props.alt + " AvatarImage"}
        width={props.size}
        height={props.size}
        priority={props.priority}
      />
    );
  }
};

export default AvatarImage;
