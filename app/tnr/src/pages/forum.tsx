import React from "react";
import { type NextPage } from "next";
import Image from "next/image";

import ContentBox from "../layout/ContentBox";
import Post from "../layout/Post";
import Loading from "../layout/Loader";

import { api } from "../utils/api";
import { groupBy } from "../utils/grouping";

const Forum: NextPage = () => {
  const { data: boards } = api.forum.getAll.useQuery();
  if (!boards) return <Loading explanation="Loading..."></Loading>;

  const forum: React.ReactNode[] = [];
  const groups = groupBy(boards, "group");
  groups.forEach((boards, group) => {
    const splits = group.split(":");
    forum.push(
      <ContentBox key={group} title={splits?.[0] ? splits?.[0] : "Unknown"} subtitle={splits?.[1]}>
        {boards.map((board) => {
          return (
            <Post
              key={board.id}
              title={board.name}
              hover_effect={true}
              align_middle={true}
              image={
                <div className="mr-3 basis-1/12">
                  <Image src={"/images/f_icon.png"} width={100} height={100} alt="Forum Icon"></Image>
                </div>
              }
            >
              {board.summary}
            </Post>
          );
        })}
      </ContentBox>
    );
  });
  return <div>{forum}</div>;
};

export default Forum;
