import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import type { NextPage } from "next";
import Link from "next/link";
import Image from "next/image";

import Loader from "@/layout/Loader";
import InputField from "@/layout/InputField";
import Button from "@/layout/Button";
import ContentBox from "@/layout/ContentBox";
import RichInput from "@/layout/RichInput";
import Post from "@/layout/Post";
import Confirm from "@/layout/Confirm";
import { Bookmark, Lock, Unlock, Trash2 } from "lucide-react";

import { api } from "@/utils/api";
import { forumBoardSchema } from "../../validators/forum";
import { show_toast } from "@/libs/toast";
import { useUserData } from "@/utils/UserContext";
import { secondsPassed } from "@/utils/time";
import { useInfinitePagination } from "@/libs/pagination";
import { canModerate } from "../../validators/forum";
import type { ForumBoardSchema } from "../../validators/forum";

const Board: NextPage = () => {
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
    },
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

  const { mutate: createThread, isLoading: load1 } = api.forum.createThread.useMutation(
    {
      onSuccess: async () => {
        await refetch();
        reset();
      },
      onError: (error) => {
        show_toast("Error on creating new thread", error.message, "error");
      },
    },
  );

  const { mutate: pinThread, isLoading: load2 } = api.forum.pinThread.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on pinning thread", error.message, "error");
    },
  });

  const { mutate: lockThread, isLoading: load3 } = api.forum.lockThread.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on locking thread", error.message, "error");
    },
  });

  const { mutate: deleteThread, isLoading: load4 } = api.forum.deleteThread.useMutation(
    {
      onSuccess: async () => {
        await refetch();
      },
      onError: (error) => {
        show_toast("Error on deleting thread", error.message, "error");
      },
    },
  );

  useEffect(() => {
    if (board) {
      setValue("board_id", board.id);
    }
  }, [board, setValue]);

  const onSubmit = handleSubmit((data) => {
    createThread(data);
  });

  if (!board) return <Loader explanation="Loading..."></Loader>;

  const isLoading = load1 || load2 || load3 || load4;
  const canEdit = userData && canModerate(userData);

  return (
    <ContentBox
      title="Forum"
      back_href="/forum"
      subtitle={board.name}
      topRightContent={
        <>
          {isLoading && <Loader></Loader>}
          {userData && !userData.isBanned && !isLoading && (
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
          )}
        </>
      }
    >
      {allThreads?.length === 0 && <div>No threads found</div>}
      {allThreads &&
        allThreads.map((thread, i) => {
          // Icons, which have to be clickable for moderators+, but just shown otherwise
          const MyBookmark = (
            <Bookmark
              className={`mr-2 h-6 w-6 ${
                thread.isPinned
                  ? "text-orange-500"
                  : canEdit
                    ? "hover:text-orange-500"
                    : ""
              }`}
            />
          );
          const MyLockIcon = thread.isLocked ? (
            <Lock className="h-6 w-6 text-orange-500" />
          ) : (
            <Unlock className={`h-6 w-6 ${canEdit ? "hover:text-orange-500" : ""}`} />
          );
          const MyDeleteIcon = (
            <Trash2
              className={`ml-2 h-6 w-6 ${canEdit ? "hover:text-orange-500" : ""}`}
            />
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
                          secondsPassed(thread.updatedAt) > 3600 * 24
                            ? "opacity-50"
                            : ""
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
                              button={MyBookmark}
                              onAccept={(e) => {
                                e.preventDefault();
                                pinThread({
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
                                lockThread({
                                  thread_id: thread.id,
                                  status: !thread.isLocked,
                                });
                              }}
                            >
                              You are about to {lockAction} a thread. Are you sure?
                            </Confirm>
                            <Confirm
                              title={`Confirm deleting thread`}
                              button={MyDeleteIcon}
                              onAccept={(e) => {
                                e.preventDefault();
                                deleteThread({ thread_id: thread.id });
                              }}
                            >
                              You are about to delete a thread. Are you sure?
                            </Confirm>
                          </>
                        ) : (
                          <>
                            {MyBookmark}
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

export default Board;
