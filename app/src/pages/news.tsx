import { type NextPage } from "next";
import { useState, useEffect } from "react";
import ContentBox from "@/layout/ContentBox";
import Button from "@/layout/Button";
import Loader from "@/layout/Loader";
import Link from "next/link";
import Image from "next/image";
import ReactHtmlParser from "react-html-parser";
import { PencilSquareIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/solid";
import { api } from "@/utils/api";
import { useUserData } from "@/utils/UserContext";
import { canCreateNews } from "../validators/forum";
import { useInfinitePagination } from "@/libs/pagination";

const News: NextPage = () => {
  const { data: userData, refetch } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const {
    data: threads,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = api.forum.getNews.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    },
  );
  const allThreads = threads?.pages.map((page) => page.data).flat();
  const board = threads?.pages[0]?.board;
  const canPost = board && userData && canCreateNews(userData);

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const { mutate } = api.forum.readNews.useMutation({
    onSuccess: async () => {
      await refetch();
    },
  });

  useEffect(() => {
    if (userData && userData.unreadNews > 0) {
      mutate();
    }
  }, [userData, mutate]);
  return (
    <ContentBox
      title="Game News"
      subtitle="Keep up to date with everything going on"
      padding={false}
      topRightContent={
        canPost && (
          <Link href={`/forum/${board.id}`}>
            <Button
              id="conversation"
              label="New"
              image={<PencilSquareIcon className="mr-2 h-5 w-5" />}
            />
          </Link>
        )
      }
    >
      <Image
        alt="welcome"
        src="/news.webp"
        width={512}
        height={195}
        className="w-full"
        priority={true}
      />
      {isLoading && <Loader explanation="Loading news" />}
      {!isLoading && (
        <div className="grid grid-cols-1">
          {allThreads?.map((thread, i) => {
            const post = thread.posts[0];
            return (
              <div
                key={i}
                ref={i === allThreads.length - 1 ? setLastElement : null}
                className={`border-2 border-amber-700 rounded-md p-3 m-2 bg-orange-100`}
              >
                <div>
                  <h2 className="font-bold">{thread.title}</h2>
                  <p className="italic font-bold  pb-1">
                    By {thread.user.username} on {thread.createdAt.toLocaleDateString()}
                  </p>
                </div>
                {post && ReactHtmlParser(post.content)}
                {board && (
                  <p className="pt-3 hover:text-orange-500 hover:cursor-pointer">
                    <Link
                      href={`/forum/${board.id}/${thread.id}`}
                      className="flex flex-row items-center justify-end"
                    >
                      <ChatBubbleLeftRightIcon className="w-5 h-5 mr-1" />
                      {thread.nPosts} Comments
                    </Link>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ContentBox>
  );
};

export default News;
