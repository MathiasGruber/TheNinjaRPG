import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ReactHtmlParser from "react-html-parser";
import { CommentOnConversation } from "@/layout/Comment";
import ContentBox from "@/layout/ContentBox";
import RichInput from "@/layout/RichInput";
import Loader from "@/layout/Loader";
import { RefreshCw } from "lucide-react";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { mutateCommentSchema } from "../validators/comments";
import { useInfinitePagination } from "@/libs/pagination";
import type { MutateCommentSchema } from "../validators/comments";

interface ConversationProps {
  convo_title?: string;
  convo_id?: string;
  back_href?: string;
  refreshKey: number;
  title: string;
  subtitle: string;
  initialBreak?: boolean;
  topRightContent?: React.ReactNode;
  onBack?: () => void;
}

const Conversation: React.FC<ConversationProps> = (props) => {
  const { data: userData, pusher } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [editorKey, setEditorKey] = useState<number>(0);

  const queryKey = {
    convo_id: props.convo_id,
    convo_title: props.convo_title,
    limit: 10,
    refreshKey: props.refreshKey,
  };

  const {
    data: comments,
    fetchNextPage,
    hasNextPage,
    refetch,
    isPending,
  } = api.comments.getConversationComments.useInfiniteQuery(queryKey, {
    enabled: props.convo_id !== undefined || props.convo_title !== undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: (previousData) => previousData,
    staleTime: Infinity,
  });
  const allComments = comments?.pages.map((page) => page.data).flat();
  const conversation = comments?.pages[0]?.convo;

  const utils = api.useUtils();

  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

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

  // Create comment & optimistically update the interface
  const { mutate: createComment, isPending: isCommenting } =
    api.comments.createConversationComment.useMutation({
      onMutate: async (newMessage) => {
        // Get previous data
        const old = utils.comments.getConversationComments.getInfiniteData();
        if (!userData || !conversation) return { old };
        // Optimistic update
        await utils.comments.getConversationComments.cancel();
        utils.comments.getConversationComments.setInfiniteData(
          queryKey,
          (oldQueryData) => {
            if (!oldQueryData) return undefined;
            const next = {
              id: "test",
              createdAt: new Date(),
              conversationId: conversation.id,
              content: newMessage.comment,
              isPinned: 0,
              villageName: userData.village?.name ?? null,
              villageHexColor: userData.village?.hexColor ?? null,
              villageKageId: userData.village?.kageId ?? null,
              userId: userData.userId,
              username: userData.username,
              avatar: userData.avatar,
              rank: userData.rank,
              level: userData.level,
              role: userData.role,
              federalStatus: userData.federalStatus,
              nRecruited: userData.nRecruited,
            };
            return {
              pageParams: oldQueryData.pageParams,
              pages: oldQueryData.pages.map((page, i) => {
                if (i === 0) {
                  return {
                    convo: page.convo,
                    data: [next, ...page.data],
                    nextCursor: page.nextCursor,
                  };
                }
                return page;
              }),
            };
          },
        );
        return { old };
      },
      onSuccess: () => {
        reset();
        setEditorKey((prev) => prev + 1);
      },
      onError: (error, _newComment, context) => {
        utils.comments.getConversationComments.setInfiniteData(queryKey, context?.old);
        showMutationToast({ success: false, message: error.message });
      },
    });

  useEffect(() => {
    if (conversation && pusher) {
      const channel = pusher.subscribe(conversation.id);
      channel.bind("event", async () => {
        await refetch();
      });
      return () => {
        pusher.unsubscribe(conversation.id);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation]);

  const handleSubmitComment = handleSubmit(
    (data) => createComment(data),
    (errors) => console.error(errors),
  );

  return (
    <div key={props.refreshKey}>
      {isPending && <Loader explanation="Loading data" />}
      {!isPending && (
        <ContentBox
          title={props.title}
          subtitle={props.subtitle}
          back_href={props.back_href}
          initialBreak={props.initialBreak}
          topRightContent={props.topRightContent}
          onBack={props.onBack}
        >
          {conversation && !conversation.isLocked && userData && !userData.isBanned && (
            <div className="relative mb-2">
              <RichInput
                id="comment"
                refreshKey={editorKey}
                height="120"
                disabled={isCommenting}
                placeholder=""
                control={control}
                error={errors.comment?.message}
                onSubmit={handleSubmitComment}
              />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-row-reverse">
                {isCommenting && <Loader />}
              </div>
              <RefreshCw
                className="h-10 w-10 absolute right-5 top-3 z-50 text-gray-400 hover:text-gray-600 hover:cursor-pointer"
                onClick={() => refetch()}
              />
            </div>
          )}
          {allComments &&
            allComments.map((comment, i) => {
              return (
                <div
                  key={comment.id}
                  ref={i === allComments.length - 1 ? setLastElement : null}
                >
                  <CommentOnConversation
                    user={comment}
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
