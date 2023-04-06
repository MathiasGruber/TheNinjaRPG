import React from "react";
import AvatarImage from "./Avatar";

export interface PostProps {
  user?: {
    userId: string;
    username: string;
    avatar: string | null;
    level: number;
    rank: string;
  };
  image?: React.ReactNode;
  title?: string;
  color?: "default" | "green" | "red" | "blue";
  children: React.ReactNode;
  options?: React.ReactNode;
  align_middle?: boolean;
  hover_effect?: boolean;
}

const Post: React.FC<PostProps> = (props) => {
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
  return (
    <div
      className={`mb-3 flex flex-row ${
        props.align_middle ? "items-center" : ""
      } rounded-lg border ${color} p-6 shadow ${props.hover_effect ? hover : ""}`}
    >
      {props.image}
      {props.user && (
        <div className="... mr-3 basis-2/12 truncate text-center  text-sm sm:basis-3/12 sm:text-base">
          <AvatarImage
            href={props.user.avatar}
            userId={props.user.userId}
            alt={props.user.username}
            size={100}
          />
          <div className="hidden sm:block">
            <p>{props.user.username}</p>
            <p>
              Lvl. {props.user.level} {props.user.rank}
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
        <div className="font-normal text-gray-700">{props.children}</div>
      </div>
      {props.options && <div>{props.options}</div>}
    </div>
  );
};

export default Post;
