import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { type NextPage } from "next";

import ReactHtmlParser from "react-html-parser";
import { ChatBubbleLeftEllipsisIcon, CheckIcon } from "@heroicons/react/24/solid";

import Button from "../../layout/Button";
import ContentBox from "../../layout/ContentBox";
import RichInput from "../../layout/RichInput";
import Post from "../../layout/Post";

import { CommentOnBug } from "../../layout/Comment";
import { api } from "../../utils/api";
import { mutateCommentSchema } from "../../validators/comments";
import { show_toast } from "../../libs/toast";
import { useInfinitePagination } from "../../libs/pagination";
import { type MutateCommentSchema } from "../../validators/comments";

const BugReport: NextPage = () => {
  const { data: sessionData } = useSession();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const bug_id = router.query.bugid as string;

  const { data: bug, refetch: refetchBug } = api.bugs.get.useQuery(
    { id: bug_id },
    { enabled: bug_id !== undefined }
  );

  const {
    data: comments,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = api.comments.getBugComments.useInfiniteQuery(
    { id: bug_id, limit: 20 },
    {
      enabled: bug_id !== undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allComments = comments?.pages.map((page) => page.data).flat();

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const createComment = api.comments.createBugComment.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on creating comment", error.message, "error");
    },
  });

  const resolveComment = api.bugs.resolve.useMutation({
    onSuccess: async () => {
      await refetchBug();
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on creating comment", error.message, "error");
    },
  });

  const {
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<MutateCommentSchema>({
    resolver: zodResolver(mutateCommentSchema),
  });

  useEffect(() => {
    if (bug) {
      setValue("object_id", bug.id);
    }
  }, [bug, setValue]);

  const handleSubmitComment = handleSubmit(
    (data) => {
      createComment.mutate(data);
      reset();
    },
    (errors) => console.error(errors)
  );

  const handleSubmitResolve = handleSubmit(
    (data) => {
      resolveComment.mutate(data);
      reset();
    },
    (errors) => console.error(errors)
  );

  return (
    <>
      <ContentBox
        title="Report Bugs"
        back_href="/bugs"
        subtitle="Details about bug report"
      >
        {bug && (
          <>
            <Post title={"Summary: " + bug.title} user={bug.user} hover_effect={false}>
              <b>System:</b> {bug.system}
              <hr />
              {bug.summary}
            </Post>
            <Post title="Report Details" hover_effect={false}>
              {ReactHtmlParser(bug.content)}
            </Post>
          </>
        )}
      </ContentBox>

      <ContentBox title="Further Input / Chat">
        <form>
          {bug && !bug.is_resolved && sessionData && !sessionData?.user?.isBanned && (
            <div className="mb-3">
              <RichInput
                id="comment"
                height="200"
                placeholder="Add information or ask questions"
                control={control}
                error={errors.comment?.message}
              />
              <div className="flex flex-row-reverse">
                <Button
                  id="submit_comment"
                  label="Add Comment"
                  image={<ChatBubbleLeftEllipsisIcon className="mr-1 h-5 w-5" />}
                  onClick={handleSubmitComment}
                />
                {sessionData.user?.role === "ADMIN" && (
                  <Button
                    id="submit_resolve"
                    label="Comment & Resolve"
                    color="green"
                    image={<CheckIcon className="mr-1 h-5 w-5" />}
                    onClick={handleSubmitResolve}
                  />
                )}
              </div>
            </div>
          )}
        </form>
        {allComments &&
          allComments.map((comment, i) => (
            <div
              key={comment.id}
              ref={i === allComments.length - 1 ? setLastElement : null}
            >
              <CommentOnBug
                user={comment.user}
                hover_effect={false}
                comment={comment}
                refetchComments={async () => await refetch()}
              >
                {ReactHtmlParser(comment.content)}
              </CommentOnBug>
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default BugReport;
