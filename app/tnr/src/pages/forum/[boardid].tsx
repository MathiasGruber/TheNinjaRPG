import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { type NextPage } from "next";
import Link from "next/link";
import Image from "next/image";

import Loader from "../../layout/Loader";
import InputField from "../../layout/InputField";
import Button from "../../layout/Button";
import ContentBox from "../../layout/ContentBox";
import RichInput from "../../layout/RichInput";
import Post from "../../layout/Post";
import Confirm from "../../layout/Confirm";
import { BookmarkIcon, LockClosedIcon, LockOpenIcon } from "@heroicons/react/24/solid";

import { api } from "../../utils/api";
import { forumBoardSchema } from "../../validators/forum";
import { show_toast } from "../../libs/toast";
import { useUserData } from "../../utils/UserContext";
import { secondsPassed } from "../../utils/time";
import { useInfinitePagination } from "../../libs/pagination";
import { canModerate } from "../../validators/forum";
import { type ForumBoardSchema } from "../../validators/forum";

const BugReport: NextPage = () => {
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const board_id = router.query.boardid as string;

  const {
    data: threads,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = api.forum.getThreads.useInfiniteQuery(
    { board_id: board_id, limit: 20 },
    {
      enabled: board_id !== undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allThreads = threads?.pages.map((page) => page.data).flat();
  const board = threads?.pages[0]?.board;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { isValid, errors },
  } = useForm<ForumBoardSchema>({
    resolver: zodResolver(forumBoardSchema),
  });

  const createThread = api.forum.createThread.useMutation({
    onSuccess: async () => {
      await refetch();
      reset();
    },
    onError: (error) => {
      show_toast("Error on creating new thread", error.message, "error");
    },
  });

  const pinThread = api.forum.pinThread.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on pinning thread", error.message, "error");
    },
  });

  const lockThread = api.forum.lockThread.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on locking thread", error.message, "error");
    },
  });

  useEffect(() => {
    if (board) {
      setValue("board_id", board.id);
    }
  }, [board, setValue]);

  const onSubmit = handleSubmit((data) => {
    createThread.mutate(data);
  });

  if (!board) return <Loader explanation="Loading..."></Loader>;

  return (
    <ContentBox
      title="Forum"
      back_href="/forum"
      subtitle={board.name}
      topRightContent={
        userData &&
        !userData.isBanned && (
          <div className="flex flex-row items-center">
            <Confirm
              title="Create a new thread"
              proceed_label="Submit"
              button={<Button id="create" label="New Thread" />}
              isValid={isValid}
              onAccept={onSubmit}
            >
              <InputField
                id="title"
                label="Title for your thread"
                register={register}
                error={errors.title?.message}
              />
              <RichInput
                id="content"
                label="Contents of your thread"
                height="300"
                placeholder=""
                control={control}
                error={errors.content?.message}
              />
            </Confirm>
          </div>
        )
      }
    >
      {allThreads &&
        allThreads.map((thread, i) => {
          // Icons, which have to be clickable for moderators+, but just shown otherwise
          const MyBookmarkIcon = (
            <BookmarkIcon
              className={`mr-2 h-6 w-6 ${
                thread.isPinned ? "fill-orange-500" : "hover:fill-orange-500"
              }`}
            />
          );
          const MyLockIcon = thread.isLocked ? (
            <LockClosedIcon className="h-6 w-6 fill-orange-500" />
          ) : (
            <LockOpenIcon className="h-6 w-6 hover:fill-orange-500" />
          );
          // Dynamic Names
          const pinAction = thread.isPinned ? "unpin" : "pin";
          const lockAction = thread.isLocked ? "unlock" : "lock";
          let title = thread.title;
          title = thread.isLocked ? "[Locked] " + title : title;
          title = thread.isPinned ? "[Pinned] " + title : title;

          return (
            <div
              key={thread.id}
              ref={i === allThreads.length - 1 ? setLastElement : null}
            >
              <Link href={"/forum/" + board.id + "/" + thread.id}>
                <Post
                  title={title}
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
                      <div className="mt-2 flex flex-row items-center ">
                        {userData && canModerate(userData) ? (
                          <>
                            <Confirm
                              title={`Confirm ${pinAction}ning thread`}
                              button={MyBookmarkIcon}
                              onAccept={(e) => {
                                e.preventDefault();
                                pinThread.mutate({
                                  thread_id: thread.id,
                                  status: !thread.isPinned,
                                });
                              }}
                            >
                              You are about to {pinAction} a thread. Are you sure?
                            </Confirm>
                            <Confirm
                              title={`Confirm ${lockAction}ing thread`}
                              button={MyLockIcon}
                              onAccept={(e) => {
                                e.preventDefault();
                                lockThread.mutate({
                                  thread_id: thread.id,
                                  status: !thread.isLocked,
                                });
                              }}
                            >
                              You are about to {lockAction} a thread. Are you sure?
                            </Confirm>
                          </>
                        ) : (
                          <>
                            {MyBookmarkIcon}
                            {MyLockIcon}
                          </>
                        )}
                      </div>
                      <div className="mt-2">
                        <span className="font-bold">{board.nPosts} </span> replies
                      </div>
                    </div>
                  }
                >
                  Started by {thread.user.username},{" "}
                  {thread.createdAt.toLocaleDateString()}
                </Post>
              </Link>
            </div>
          );
        })}
    </ContentBox>
  );
};

export default BugReport;
