"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

import ContentBox from "@/layout/ContentBox";
import Post from "@/layout/Post";
import Loader from "@/layout/Loader";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/app/_trpc/client";
import { secondsPassed } from "@/utils/time";
import { groupBy } from "@/utils/grouping";
import { IMG_ICON_FORUM } from "@/drizzle/constants";

export const ForumSkeleton = () => {
  return (
    <div>
      <ContentBox title="Main Broadcast" subtitle="General boards for TNR">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[100px] w-full bg-popover flex items-center justify-center">
            <Loader explanation="Loading..."></Loader>
          </Skeleton>
          <Skeleton className="h-[100px] w-full bg-popover"></Skeleton>
        </div>
      </ContentBox>
      <ContentBox title="Text-Based RPG" subtitle="Village Boards" initialBreak>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[150px] w-full bg-popover"></Skeleton>
          <Skeleton className="h-[150px] w-full bg-popover"></Skeleton>
          <Skeleton className="h-[150px] w-full bg-popover"></Skeleton>
          <Skeleton className="h-[150px] w-full bg-popover"></Skeleton>
          <Skeleton className="h-[150px] w-full bg-popover"></Skeleton>
          <Skeleton className="h-[150px] w-full bg-popover"></Skeleton>
        </div>
      </ContentBox>
      <ContentBox title="The Chat Lounge" subtitle="Fun boards for TNR">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[130px] w-full bg-popover"></Skeleton>
        </div>
      </ContentBox>
    </div>
  );
};

export default function Forum() {
  const { data: boards } = api.forum.getAll.useQuery();
  if (!boards) return <ForumSkeleton />;

  const forum: React.ReactNode[] = [];
  const groups = groupBy(boards, "group");
  let i = 0;
  groups.forEach((boards, group) => {
    const splits = group.split(":");
    forum.push(
      <div key={group}>
        <ContentBox
          title={splits?.[0] ? splits?.[0] : "Unknown"}
          subtitle={splits?.[1]}
          initialBreak={i !== 0}
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
                        src={IMG_ICON_FORUM}
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
      </div>,
    );
    i++;
  });
  return <div>{forum}</div>;
}
