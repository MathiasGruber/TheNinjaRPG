import { useState } from "react";
import { type NextPage } from "next";
import { useForm, FormProvider } from "react-hook-form";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import ReactHtmlParser from "react-html-parser";

import SubmitButton from "../../layout/SubmitButton";
import ContentBox from "../../layout/ContentBox";
import RichInput from "../../layout/RichInput";
import HiddenField from "../../layout/HiddenField";
import Post from "../../layout/Post";
import { api } from "../../utils/api";
import { type CreateCommentSchema } from "../../validators/bugs";
import { createCommentSchema } from "../../validators/bugs";
import { show_toast } from "../../libs/toast";
import { useInfinitePagination } from "../../libs/pagination";

const BugReport: NextPage = () => {
  const { data: sessionData } = useSession();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const bug_id = router.query.bugid as string;

  const { data: bug } = api.bugs.get.useQuery(
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

  // Form handling
  const methods = useForm<CreateCommentSchema>({
    resolver: zodResolver(createCommentSchema),
  });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = methods;
  const onSubmit = handleSubmit(async (data) => {
    createComment.mutate(data);
    await refetch();
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit}>
        <ContentBox
          title="Report Bugs"
          back_href="/bugs"
          subtitle="Details about bug report"
        >
          {bug && (
            <>
              <Post title={"Summary: " + bug.title} user={bug.user}>
                <b>System:</b> {bug.system}
                <hr />
                {bug.summary}
              </Post>
              <Post title="Report Details">
                {ReactHtmlParser(bug.description)}
              </Post>
            </>
          )}
        </ContentBox>

        <ContentBox title="Further Input / Chat">
          {bug && sessionData && (
            <div className="mb-3">
              <RichInput
                id="comment"
                height="200"
                placeholder="Add information or ask questions"
                control={control}
                error={errors.comment?.message}
              />
              <HiddenField register={register} id="bug_id" value={bug.id} />
              <div className="flex flex-row-reverse">
                <SubmitButton id="submit_comment" label="Add Comment" />
                <SubmitButton id="submit_resolve" label="Comment & Resolve" />
              </div>
            </div>
          )}
          {allComments &&
            allComments.map((comment, i) => (
              <div
                key={comment.id}
                ref={i === allComments.length - 1 ? setLastElement : null}
              >
                <Post title={comment.user.username} user={comment.user}>
                  {ReactHtmlParser(comment.content)}
                </Post>
              </div>
            ))}
        </ContentBox>
      </form>
    </FormProvider>
  );
};

export default BugReport;
