"use client";

import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Link from "next/link";
import Image from "next/image";
import { parseHtml } from "@/utils/parse";
import { Button } from "@/components/ui/button";
import { SquarePen, MessagesSquare } from "lucide-react";
import { api } from "@/app/_trpc/client";
import { useInfinitePagination } from "@/libs/pagination";
import type { InfiniteThreads } from "@/routers/forum";

interface FancyForumThreadsProps {
  board_name: string;
  back_href?: string;
  initialData: Awaited<InfiniteThreads>;
  initialBreak?: boolean;
  image?: string;
  canPost?: boolean;
}

const FancyForumThreads: React.FC<FancyForumThreadsProps> = (props) => {
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const {
    data: threads,
    isPending,
    fetchNextPage,
    hasNextPage,
  } = api.forum.getThreads.useInfiniteQuery(
    { limit: 10, board_name: props.board_name },
    {
      initialData: () => ({ pages: [props.initialData], pageParams: [null] }),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  );
  const allThreads = threads?.pages.map((page) => page.threads).flat();
  const board = threads?.pages[0]?.board;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  if (!board || isPending) return <Loader explanation="Loading data" />;

  return (
    <ContentBox
      title={board.name}
      subtitle={board.summary}
      back_href={props.back_href}
      initialBreak={props.initialBreak}
      padding={false}
      topRightContent={
        props.canPost &&
        board && (
          <Link href={`/forum/${board.id}`}>
            <Button id="conversation">
              <SquarePen className="mr-2 h-5 w-5" />
              New
            </Button>
          </Link>
        )
      }
    >
      {props.image && (
        <Image
          alt="threads-image"
          src={props.image}
          width={512}
          height={195}
          className="w-full"
          priority={true}
        />
      )}
      <div className="grid grid-cols-1">
        {allThreads?.map((thread, i) => {
          const post = thread.posts[0];
          return (
            <div
              key={i}
              ref={i === allThreads.length - 1 ? setLastElement : null}
              className={`border-2 rounded-md p-3 m-2 bg-popover`}
            >
              <div>
                <h2 className="font-bold">{thread.title}</h2>
                <p className="italic font-bold  pb-1" suppressHydrationWarning>
                  By {thread.user.username} on {thread.createdAt.toLocaleDateString()}
                </p>
              </div>
              {post && parseHtml(post.content)}
              {board && (
                <p className="pt-3 hover:text-orange-500 hover:cursor-pointer">
                  <Link
                    href={`/forum/${board.id}/${thread.id}`}
                    className="flex flex-row items-center justify-end"
                  >
                    <MessagesSquare className="w-5 h-5 mr-1" />
                    {thread.nPosts} Comments
                  </Link>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </ContentBox>
  );
};

export default FancyForumThreads;
