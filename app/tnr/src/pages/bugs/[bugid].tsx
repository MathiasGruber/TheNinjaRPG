import { useState } from "react";
import { type NextPage } from "next";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import ReactHtmlParser from "react-html-parser";

import SubmitButton from "../../layout/SubmitButton";
import ContentBox from "../../layout/ContentBox";
import RichInput from "../../layout/RichInput";
import HiddenField from "../../layout/HiddenField";
import Post from "../../layout/Post";
import Comment from "../../layout/Comment";
import { api } from "../../utils/api";
import { type MutateCommentSchema } from "../../validators/bugs";
import { mutateCommentSchema } from "../../validators/bugs";
import { show_toast } from "../../libs/toast";
import { useInfinitePagination } from "../../libs/pagination";

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
  } = api.bugs.getComments.useInfiniteQuery(
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

  const createComment = api.bugs.createComment.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on creating comment", error.message, "error");
    },
  });

  const resolveComment = api.bugs.resolveComment.useMutation({
    onSuccess: async () => {
      await refetchBug();
      await refetch();
    },
    onError: (error) => {
      show_toast("Error on creating comment", error.message, "error");
    },
  });

  // Form handling
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MutateCommentSchema>({
    resolver: zodResolver(mutateCommentSchema),
  });

  const handleSubmitComment = handleSubmit((data) => {
    createComment.mutate(data);
    reset();
  });

  const handleSubmitResolve = handleSubmit((data) => {
    resolveComment.mutate(data);
    reset();
  });

  return (
    <>
      <ContentBox
        title="Report Bugs"
        back_href="/bugs"
        subtitle="Details about bug report"
      >
        {bug && (
          <>
            <Post
              title={"Summary: " + bug.title}
              user={bug.user}
              hover_effect={false}
            >
              <b>System:</b> {bug.system}
              <hr />
              {bug.summary}
            </Post>
            <Post title="Report Details" hover_effect={false}>
              {ReactHtmlParser(bug.description)}
            </Post>
          </>
        )}
      </ContentBox>

      <ContentBox title="Further Input / Chat">
        <form>
          {bug && !bug.is_resolved && sessionData && (
            <div className="mb-3">
              <RichInput
                id="comment"
                height="200"
                placeholder="Add information or ask questions"
                control={control}
                error={errors.comment?.message}
              />
              <HiddenField register={register} id="object_id" value={bug.id} />
              <div className="flex flex-row-reverse">
                <SubmitButton
                  id="submit_comment"
                  label="Add Comment"
                  onClick={handleSubmitComment}
                />
                {sessionData.user?.role === "ADMIN" && (
                  <SubmitButton
                    id="submit_resolve"
                    label="Comment & Resolve"
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
              <Comment
                user={comment.user}
                hover_effect={false}
                comment={comment}
                refetchComments={async () => await refetch()}
              >
                {ReactHtmlParser(comment.content)}
              </Comment>
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default BugReport;
