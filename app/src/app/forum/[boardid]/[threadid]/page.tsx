"use client";

import { useState, useEffect, use } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseHtml } from "@/utils/parse";
import Loader from "@/layout/Loader";
import Pagination from "@/layout/Pagination";
import ContentBox from "@/layout/ContentBox";
import RichInput from "@/layout/RichInput";
import NotFoundPage from "@/app/[...not-found]/page";
import { showMutationToast } from "@/libs/toast";
import { forumText } from "@/layout/seoTexts";
import { CommentOnForum } from "@/layout/Comment";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { mutateCommentSchema } from "@/validators/comments";
import { type MutateCommentSchema } from "@/validators/comments";

export default function Thread(props: { params: Promise<{ threadid: string }> }) {
  const params = use(props.params);
  const limit = 10;
  const { data: userData } = useUserData();
  const [page, setPage] = useState(0);
  const thread_id = params.threadid;

  const { data: comments, refetch } = api.comments.getForumComments.useQuery(
    { thread_id: thread_id, limit: limit, cursor: page },
    {
      enabled: !!thread_id,
      placeholderData: (previousData) => previousData,
    },
  );
  const thread = comments?.thread;
  const allComments = comments?.data;
  const totalPages = comments?.totalPages ?? 0;
  const totalComments = comments?.totalComments ?? 0;

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

  const { mutate: createComment, isPending } =
    api.comments.createForumComment.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        reset();
        if (totalComments && totalPages && allComments) {
          const newPage = totalComments % limit === 0 ? totalPages : totalPages - 1;
          if (newPage !== page) {
            setPage(newPage);
          }
          await refetch();
        }
      },
    });

  const handleSubmitComment = handleSubmit(
    (data) => createComment(data),
    (errors) => console.error(errors),
  );

  return (
    <>
      {!userData && (
        <ContentBox
          title="Public Forum"
          back_href={thread ? "/forum/" + thread.boardId : "/forum"}
        >
          {forumText}
        </ContentBox>
      )}
      {!thread && <NotFoundPage />}
      {thread && (
        <ContentBox
          title="Forum"
          back_href={userData ? "/forum/" + thread.boardId : undefined}
          initialBreak={userData ? false : true}
          subtitle={thread.title}
        >
          {allComments?.map((comment, i) => {
            return (
              <div key={comment.id}>
                <CommentOnForum
                  title={i === 0 && page === 0 ? thread.title : undefined}
                  user={comment.user}
                  hover_effect={false}
                  comment={comment}
                >
                  {parseHtml(comment.content)}
                </CommentOnForum>
              </div>
            );
          })}
          {thread &&
            userData &&
            !thread.isLocked &&
            !userData.isBanned &&
            !userData.isSilenced && (
              <div className="mb-3 relative">
                <RichInput
                  id="comment"
                  height="200"
                  refreshKey={totalComments}
                  placeholder=""
                  control={control}
                  disabled={isPending}
                  error={errors.comment?.message}
                  onSubmit={handleSubmitComment}
                />
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-row-reverse">
                  {isPending && <Loader />}
                </div>
              </div>
            )}
        </ContentBox>
      )}
      {totalPages > 0 && (
        <Pagination current={page} total={totalPages} setPage={setPage} />
      )}
    </>
  );
}
