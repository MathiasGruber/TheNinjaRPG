import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/solid";
import ReactHtmlParser from "react-html-parser";

import { CommentOnConversation } from "../layout/Comment";
import ContentBox from "../layout/ContentBox";
import RichInput from "../layout/RichInput";
import Button from "../layout/Button";

import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { mutateCommentSchema } from "../validators/comments";
import { useInfinitePagination } from "../libs/pagination";
import { type MutateCommentSchema } from "../validators/comments";

interface ConversationProps {
  convo_title?: string;
  convo_id?: string;
  refreshKey: number;
  title: string;
  subtitle: string;
  chatbox_options?: React.ReactNode;
}

const Conversation: React.FC<ConversationProps> = (props) => {
  const { data: sessionData } = useSession();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [editorKey, setEditorKey] = useState<number>(0);

  const {
    data: coments,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = api.comments.getConversationComments.useInfiniteQuery(
    {
      convo_id: props.convo_id,
      convo_title: props.convo_title,
      limit: 10,
      refreshKey: props.refreshKey,
    },
    {
      enabled: props.convo_id !== undefined || props.convo_title !== undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allComments = coments?.pages.map((page) => page.data).flat();
  const conversation = coments?.pages[0]?.convo;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

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
    if (conversation) {
      setValue("object_id", conversation.id);
    }
  }, [conversation, setValue]);

  const createComment = api.comments.createConversationComment.useMutation({
    onSuccess: async () => {
      reset();
      setEditorKey((prev) => prev + 1);
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
  console.log(props.refreshKey);
  return (
    <div key={props.refreshKey}>
      {conversation &&
        !conversation.isLocked &&
        sessionData &&
        !sessionData?.user?.isBanned && (
          <ContentBox title={props.title} subtitle={props.subtitle}>
            <form>
              <div className="mb-3">
                <RichInput
                  id="comment"
                  refreshKey={editorKey}
                  height="150"
                  placeholder=""
                  control={control}
                  error={errors.comment?.message}
                />
                <div className="flex flex-row-reverse">
                  <Button
                    id="submit_comment"
                    label="Send Message"
                    image={<ChatBubbleLeftEllipsisIcon className="mr-1 h-5 w-5" />}
                    onClick={handleSubmitComment}
                  />
                  {props.chatbox_options}
                </div>
              </div>
            </form>
          </ContentBox>
        )}
      {allComments && allComments.length > 0 && (
        <ContentBox title="Messages">
          {allComments.map((comment, i) => {
            return (
              <div
                key={comment.id}
                ref={i === allComments.length - 1 ? setLastElement : null}
              >
                <CommentOnConversation
                  user={comment.user}
                  hover_effect={false}
                  comment={comment}
                  refetchComments={async () => await refetch()}
                >
                  {ReactHtmlParser(comment.content)}
                </CommentOnConversation>
              </div>
            );
          })}
        </ContentBox>
      )}
    </div>
  );
};

export default Conversation;
