import React, { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseHtml } from "@/utils/parse";
import { CommentOnConversation } from "@/layout/Comment";
import ContentBox from "@/layout/ContentBox";
import RichInput from "@/layout/RichInput";
import Loader from "@/layout/Loader";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useUserData } from "@/utils/UserContext";
import { api, useGlobalOnMutateProtect } from "@/app/_trpc/client";
import { secondsFromNow } from "@/utils/time";
import { showMutationToast } from "@/libs/toast";
import { Check } from "lucide-react";
import { mutateCommentSchema } from "@/validators/comments";
import { useInfinitePagination } from "@/libs/pagination";
import { CONVERSATION_QUIET_MINS } from "@/drizzle/constants";
import { Skeleton } from "@/components/ui/skeleton";
import type { MutateCommentSchema } from "@/validators/comments";
import type { ArrayElement } from "@/utils/typeutils";

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

export const ConversationSkeleton: React.FC<ConversationProps> = (props) => {
  return (
    <ContentBox
      title={props.title}
      subtitle={props.subtitle}
      back_href={props.back_href}
      initialBreak={props.initialBreak}
      topRightContent={props.topRightContent}
      onBack={props.onBack}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[100px] w-full items-center justify-center flex bg-popover">
          <Loader explanation="Loading conversation" />
        </Skeleton>
        {Array.from({ length: 10 }).map((_, i) => (
          <div className="flex flex-row gap-2" key={i}>
            <Skeleton className="h-[110px] lg:h-[150px] w-1/4 bg-popover" />
            <Skeleton className="h-[110px] lg:h-[150px] w-3/4 bg-popover" />
          </div>
        ))}
      </div>
    </ContentBox>
  );
};

const Conversation: React.FC<ConversationProps> = (props) => {
  const onMutateCheck = useGlobalOnMutateProtect();
  const { data: userData, pusher } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [editorKey, setEditorKey] = useState<number>(0);
  const [quietTime, setQuietTime] = useState<Date>(
    secondsFromNow(CONVERSATION_QUIET_MINS * 60),
  );
  const silence = new Date() > quietTime;

  const queryKey = {
    convo_id: props.convo_id,
    convo_title: props.convo_title,
    limit: 10,
    refreshKey: props.refreshKey,
  };

  // Fetch comments
  const {
    data: comments,
    fetchNextPage,
    hasNextPage,
    isPending,
  } = api.comments.getConversationComments.useInfiniteQuery(queryKey, {
    enabled: props.convo_id !== undefined || props.convo_title !== undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: (previousData) => previousData,
  });
  const allComments = comments?.pages.map((page) => page.data).flat();
  const conversation = comments?.pages[0]?.convo;
  type ReturnedComment = ArrayElement<typeof allComments>;

  // tRPC utils
  const utils = api.useUtils();

  // infinite pagination
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Handle for submission of comment
  const {
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<MutateCommentSchema>({
    resolver: zodResolver(mutateCommentSchema),
  });

  // Set the object_id to the conversation id
  useEffect(() => {
    if (conversation) {
      setValue("object_id", conversation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  /**
   * Perform an optimistic update to the conversation comments, i.e. no API calls,
   * just directly insert message into the comments array.
   * @param newMessage
   * @returns
   */
  const optimisticConversationUpdate = async (
    newMessage: MutateCommentSchema | ReturnedComment,
  ) => {
    // We are active
    setQuietTime(secondsFromNow(CONVERSATION_QUIET_MINS * 60));
    // Get previous data
    const old = utils.comments.getConversationComments.getInfiniteData();
    if (!userData || !conversation) return { old };
    // Optimistic update
    await utils.comments.getConversationComments.cancel();
    utils.comments.getConversationComments.setInfiniteData(queryKey, (oldQueryData) => {
      if (!oldQueryData) return undefined;
      const next =
        "id" in newMessage
          ? newMessage
          : {
              id: nanoid(),
              createdAt: new Date(),
              conversationId: conversation.id,
              content: newMessage.comment,
              isPinned: 0,
              isReported: false,
              villageName: userData.village?.name ?? null,
              villageHexColor: userData.village?.hexColor ?? null,
              villageKageId: userData.village?.kageId ?? null,
              userId: userData.userId,
              username: userData.username,
              avatar: userData.avatar,
              rank: userData.rank,
              isOutlaw: userData.isOutlaw,
              level: userData.level,
              role: userData.role,
              customTitle: userData.customTitle,
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
    });
    return { old };
  };

  // Create comment & optimistically update the interface
  const { mutate: createComment, isPending: isCommenting } =
    api.comments.createConversationComment.useMutation({
      onMutate: async (newMessage) => {
        onMutateCheck();
        return await optimisticConversationUpdate(newMessage);
      },
      onSuccess: () => {
        if (conversation) reset({ object_id: conversation.id, comment: "" });
        setEditorKey((prev) => prev + 1);
      },
      onError: (error, _newComment, context) => {
        utils.comments.getConversationComments.setInfiniteData(queryKey, context?.old);
        showMutationToast({ success: false, message: error.message });
      },
    });

  // Create comment & optimistically update the interface
  const { mutate: fetchComment } = api.comments.fetchConversationComment.useMutation({
    onSuccess: async (data) => {
      if (data) await optimisticConversationUpdate(data);
    },
  });

  /**
   * Websockets event listener
   */
  useEffect(() => {
    if (conversation && pusher) {
      const channel = pusher.subscribe(conversation.id);
      channel.bind("event", (data: { fromId?: string; commentId?: string }) => {
        if (!silence && data?.fromId !== userData?.userId && data?.commentId) {
          fetchComment({ commentId: data.commentId });
        }
      });
      return () => {
        pusher.unsubscribe(conversation.id);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silence, conversation]);

  /**
   * Submit comment
   */
  const handleSubmitComment = handleSubmit((data) => createComment(data));

  /**
   * Invalidate comments & allow refetches again
   */
  const invalidateComments = async () => {
    await utils.comments.getConversationComments.invalidate();
  };

  const unique = new Set();

  return (
    <div key={props.refreshKey}>
      {isPending && <ConversationSkeleton {...props} />}
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
                placeholder="Write comment..."
                control={control}
                error={errors.comment?.message}
                onSubmit={handleSubmitComment}
              />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-row-reverse">
                {isCommenting && <Loader />}
              </div>
              <RefreshCw
                className="h-8 w-8 absolute right-24 top-[50%] translate-y-[-50%]  z-20 text-gray-400 hover:text-gray-600 opacity-50 hover:cursor-pointer"
                onClick={invalidateComments}
              />
            </div>
          )}
          {allComments
            ?.filter((c) => c.conversationId === conversation?.id)
            .filter((c) => {
              const duplicate = unique.has(c.id);
              unique.add(c.id);
              return !duplicate;
            })
            .map((comment, i) => {
              return (
                <div
                  key={comment.id}
                  ref={i === allComments.length - 1 ? setLastElement : null}
                >
                  <CommentOnConversation
                    user={comment}
                    hover_effect={false}
                    comment={comment}
                  >
                    {parseHtml(comment.content)}
                  </CommentOnConversation>
                </div>
              );
            })}
          {silence && (
            <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-start bg-black bg-opacity-80">
              <div className="text-center text-white pt-10">
                <p className="p-5 text-5xl">Are you still there?</p>
                <Button
                  size="xl"
                  onClick={async () => {
                    setQuietTime(secondsFromNow(CONVERSATION_QUIET_MINS * 60));
                    await invalidateComments();
                  }}
                >
                  <Check className="w-8 h-8 mr-3" />
                  Yep
                </Button>
              </div>
            </div>
          )}
        </ContentBox>
      )}
    </div>
  );
};

export default Conversation;
