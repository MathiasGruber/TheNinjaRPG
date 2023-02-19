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

const BugReport: NextPage = () => {
  // Get the bug report & comments in question
  const router = useRouter();
  const bug_id = router.query.bugid as string;
  const { data: bug, refetch: refetchBug } = api.bugs.get.useQuery(
    { id: bug_id },
    { enabled: bug_id !== undefined }
  );
  const { data: comments, refetch: refetchComments } =
    api.bugs.getComments.useQuery(
      { id: bug_id },
      { enabled: bug_id !== undefined }
    );
  // Post comment
  const createComment = api.bugs.createComment.useMutation({
    onSuccess: async () => {
      await refetchComments();
    },
    onError: (error) => {
      show_toast("Error on creating comment", error.message, "error");
    },
  });
  // User data
  const { data: sessionData } = useSession();
  // Form handling
  const methods = useForm<CreateCommentSchema>({
    resolver: zodResolver(createCommentSchema),
  });
  // Destruct methods
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = methods;
  // Handle form submit
  const onSubmit = handleSubmit(async (data) => {
    console.log("Calling onsubmit", data);
    createComment.mutate(data);
    await refetchComments();
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
          {comments &&
            comments.map((comment) => (
              <Post
                key={comment.id}
                title={comment.user.username}
                user={comment.user}
              >
                {ReactHtmlParser(comment.content)}
              </Post>
            ))}
          {bug && sessionData && (
            <div>
              <RichInput
                id="comment"
                height="200"
                placeholder="Add information or ask questions"
                control={control}
                error={errors.comment?.message}
              />
              <HiddenField register={register} id="bug_id" value={bug.id} />
              <SubmitButton id="submit_comment" label="Add Comment" />
            </div>
          )}
        </ContentBox>
      </form>
    </FormProvider>
  );
};

export default BugReport;
