import React from "react";
import AvatarImage from "./Avatar";

interface PostProps {
  user?: {
    username: string;
    avatar: string | null;
    level: number;
    rank: string;
  };
  title: string;
  children: React.ReactNode;
  options?: React.ReactNode;
}

const Post: React.FC<PostProps> = (props) => {
  return (
    <div className="mb-3 flex flex-row rounded-lg border border-gray-200 bg-orange-50 p-6 shadow hover:bg-gray-100">
      {props.user && (
        <div className="mr-3 basis-3/12 text-center">
          <AvatarImage
            href={props.user.avatar}
            alt={props.user.username}
            size={100}
          />
          <p>{props.user.username}</p>
          <p>
            Lvl. {props.user.level} {props.user.rank}
          </p>
        </div>
      )}
      <div className="grow">
        <h3 className="text-xl font-bold tracking-tight text-gray-900">
          {props.title}
        </h3>
        <div className="font-normal text-gray-700">{props.children}</div>
      </div>
      {props.options && <div>{props.options}</div>}
    </div>
  );
};

export default Post;
