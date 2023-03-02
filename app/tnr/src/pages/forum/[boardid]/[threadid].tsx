import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { type NextPage } from "next";

import ReactHtmlParser from "react-html-parser";
import { ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/solid";

import Loader from "../../../layout/Loader";
import Pagination from "../../../layout/Pagination";
import Button from "../../../layout/Button";
import ContentBox from "../../../layout/ContentBox";
import RichInput from "../../../layout/RichInput";
import { CommentOnForum } from "../../../layout/Comment";

import { api } from "../../../utils/api";
import { show_toast } from "../../../libs/toast";
import { mutateCommentSchema } from "../../../validators/comments";
import { type MutateCommentSchema } from "../../../validators/comments";

const BugReport: NextPage = () => {
  const { data: sessionData } = useSession();
  const [page, setPage] = useState(0);
  const router = useRouter();
  const thread_id = router.query.threadid as string;

  const { data: comments, refetch } = api.comments.getForumComments.useQuery(
    { thread_id: thread_id, limit: 3, cursor: page },
    {
      enabled: thread_id !== undefined,
    }
  );
  console.log(comments);
  const allComments = comments?.data;
  const thread = comments?.thread;
  const totalPages = comments?.total;

  const {
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<MutateCommentSchema>({
    resolver: zodResolver(mutateCommentSchema),
  });

  useEffect(() => {
    if (thread) {
      setValue("object_id", thread.id);
    }
  }, [thread, setValue]);

  const createComment = api.comments.createForumComment.useMutation({
    onSuccess: async () => {
      reset();
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on creating new thread", error.message, "error");
    },
  });

  const handleSubmitComment = handleSubmit(
    (data) => {
      createComment.mutate(data);
    },
    (errors) => console.error(errors)
  );

  if (!thread) return <Loader explanation="Loading..."></Loader>;

  return (
    <>
      <ContentBox
        title="Forum"
        back_href={"/forum/" + thread.boardId}
        subtitle={thread.title}
      >
        {allComments &&
          allComments.map((comment, i) => {
            return (
              <div key={comment.id}>
                <CommentOnForum
                  title={i === 0 && page === 0 ? thread.title : undefined}
                  user={comment.user}
                  hover_effect={false}
                  comment={comment}
                  refetchComments={async () => await refetch()}
                >
                  {ReactHtmlParser(comment.content)}
                </CommentOnForum>
              </div>
            );
          })}
      </ContentBox>
      {totalPages && <Pagination current={page} total={totalPages} setPage={setPage} />}
      <ContentBox title="Create New Post">
        <form>
          {thread &&
            !thread.isLocked &&
            sessionData &&
            !sessionData?.user?.isBanned && (
              <div className="mb-3">
                <RichInput
                  id="comment"
                  height="200"
                  placeholder="Write your comment here..."
                  control={control}
                  error={errors.comment?.message}
                />
                <div className="flex flex-row-reverse">
                  <Button
                    id="submit_comment"
                    label="Post Comment"
                    image={<ChatBubbleLeftEllipsisIcon className="mr-1 h-5 w-5" />}
                    onClick={handleSubmitComment}
                  />
                </div>
              </div>
            )}
        </form>
      </ContentBox>
    </>
  );
};

export default BugReport;
