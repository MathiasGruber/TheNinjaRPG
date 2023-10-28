import React from "react";
import AvatarImage from "./Avatar";
import Link from "next/link";
import { capitalizeFirstLetter } from "@/utils/sanitize";

export interface PostProps {
  user?: {
    userId: string;
    username: string;
    avatar: string | null;
    level: number;
    rank: string;
    role: string;
    federalStatus: string;
  };
  image?: React.ReactNode;
  title?: string;
  color?: "default" | "green" | "red" | "blue";
  children: any;
  options?: React.ReactNode;
  align_middle?: boolean;
  hover_effect?: boolean;
}

const Post: React.FC<PostProps> = (props) => {
  let userColor = "text-gray-900";
  let color = "bg-orange-50";
  let hover = "hover:bg-orange-100";

  switch (props.color) {
    case "green":
      color = "bg-green-200";
      hover = "hover:bg-green-300";
      break;
    case "red":
      color = "bg-red-300";
      hover = "hover:bg-red-400";
      break;
    case "blue":
      color = "bg-blue-200";
      hover = "hover:bg-blue-300";
      break;
  }

  switch (props.user?.federalStatus) {
    case "NORMAL":
      userColor =
        "bg-gradient-to-r from-blue-800 via-blue-500 to-blue-800 bg-clip-text text-transparent font-black";
      break;
    case "SILVER":
      userColor =
        "bg-gradient-to-r from-gray-500 via-gray-400 to-gray-500 bg-clip-text text-transparent font-black";
      break;
    case "GOLD":
      userColor =
        "bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 bg-clip-text text-transparent font-black";
      break;
  }

  switch (props.user?.role) {
    case "MODERATOR":
      userColor =
        "bg-gradient-to-r from-green-800 via-green-500 to-green-800 bg-clip-text text-transparent font-black";
      break;
    case "ADMIN":
      userColor =
        "bg-gradient-to-r from-red-500 via-red-400 to-red-500 bg-clip-text text-transparent font-black";
      break;
  }

  return (
    <div
      className={`mb-3 flex flex-row ${
        props.align_middle ? "items-center" : ""
      } rounded-lg border ${color} p-6 shadow ${props.hover_effect ? hover : ""}`}
    >
      {props.image}
      {props.user && (
        <div className="... mr-3 basis-2/12 truncate text-center  text-sm sm:basis-3/12 sm:text-base">
          <Link href={`/users/${props.user.userId}`}>
            <AvatarImage
              href={props.user.avatar}
              userId={props.user.userId}
              alt={props.user.username}
              size={100}
            />
          </Link>
          <div className="hidden sm:block">
            <p className={userColor}>{props.user.username}</p>
            <p>
              Lvl. {props.user.level} {capitalizeFirstLetter(props.user.rank)}
            </p>
          </div>
        </div>
      )}
      <div className="grow basis-1/2">
        {props.title && (
          <h3 className="text-xl font-bold tracking-tight text-gray-900">
            {props.title}
          </h3>
        )}
        <div className="relative font-normal text-gray-900 h-full">
          {props.children}
        </div>
      </div>
      {props.options && <div>{props.options}</div>}
    </div>
  );
};

export default Post;
