import React from "react";
import { type NextPage } from "next";
import Image from "next/image";
import Link from "next/link";

import ContentBox from "../layout/ContentBox";
import Post from "../layout/Post";
import Loader from "../layout/Loader";

import { api } from "../utils/api";
import { secondsPassed } from "../utils/time";
import { groupBy } from "../utils/grouping";

const Forum: NextPage = () => {
  const { data: boards } = api.forum.getAll.useQuery();
  if (!boards) return <Loader explanation="Loading..."></Loader>;

  const forum: React.ReactNode[] = [];
  const groups = groupBy(boards, "group");
  groups.forEach((boards, group) => {
    const splits = group.split(":");
    forum.push(
      <div key={group}>
        <ContentBox
          title={splits?.[0] ? splits?.[0] : "Unknown"}
          subtitle={splits?.[1]}
        >
          {boards.map((board) => {
            return (
              <Link key={board.id} href={"/forum/" + board.id}>
                <Post
                  title={board.name}
                  hover_effect={true}
                  align_middle={true}
                  image={
                    <div className="mr-3 basis-1/12">
                      <Image
                        src={"/images/f_icon.png"}
                        width={100}
                        height={100}
                        alt="Forum Icon"
                        className={
                          secondsPassed(board.updatedAt) > 3600 * 24 ? "opacity-50" : ""
                        }
                      ></Image>
                    </div>
                  }
                  options={
                    <div className="ml-3">
                      <span className="font-bold">{board.nThreads} </span> topics
                      <br />
                      <span className="font-bold">{board.nPosts} </span> replies
                    </div>
                  }
                >
                  {board.summary}
                </Post>
              </Link>
            );
          })}
        </ContentBox>
        <br />
      </div>
    );
  });
  return <div>{forum}</div>;
};

export default Forum;
