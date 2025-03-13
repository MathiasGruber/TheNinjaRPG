import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SquarePen, Trash2, Flag, BarChart2 } from "lucide-react";
import { Quote, SmilePlus } from "lucide-react";
import Post, { type PostProps } from "./Post";
import RichInput from "./RichInput";
import Confirm from "@/layout/Confirm";
import ReportUser from "@/layout/Report";
import { cn } from "src/libs/shadui";
import { canDeleteComment } from "@/utils/permissions";
import { mutateCommentSchema } from "@/validators/comments";
import { api } from "@/app/_trpc/client";
import { useUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import EmojiPicker from "emoji-picker-react";
import type { systems } from "@/validators/reports";
import type { ConversationComment } from "@/drizzle/schema";
import type { ForumPost } from "@/drizzle/schema";
import type { UserReportComment } from "@/drizzle/schema";
import type { MutateCommentSchema } from "@/validators/comments";
import type { DeleteCommentSchema } from "@/validators/comments";
import { canSeeSecretData } from "@/utils/permissions";
import { ModerationSummary } from "@/layout/ModerationSummary";

/**
 * Component for handling comments on user reports
 * @param props
 * @returns
 */
interface UserReportCommentProps extends PostProps {
  comment: UserReportComment;
}
export const CommentOnReport: React.FC<UserReportCommentProps> = (props) => {
  const [editing, setEditing] = useState(false);
  return <BaseComment {...props} editing={editing} setEditing={setEditing} />;
};

/**
 * Component for handling comments on conversations
 */
interface ConversationCommentProps extends PostProps {
  comment: ConversationComment;
  toggleReaction?: (emoji: string) => void;
  setQuoteId?: (id: string) => void;
  quoteIds?: string[] | null;
}
export const CommentOnConversation: React.FC<ConversationCommentProps> = (props) => {
  const [editing, setEditing] = useState(false);
  const utils = api.useUtils();

  const editComment = api.comments.editConversationComment.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.comments.getConversationComments.invalidate();
        setEditing(false);
      }
    },
  });

  const deleteComment = api.comments.deleteConversationComment.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.comments.getConversationComments.invalidate();
        setEditing(false);
      }
    },
  });

  return (
    <BaseComment
      {...props}
      system="conversation_comment"
      editComment={editComment.mutate}
      deleteComment={deleteComment.mutate}
      editing={editing}
      setEditing={setEditing}
    />
  );
};

/**
 * Component for handling comments on forum threads
 */
interface ForumCommentProps extends PostProps {
  comment: ForumPost;
  toggleReaction?: (emoji: string) => void;
  setQuoteId?: (id: string) => void;
  quoteIds?: string[] | null;
}
export const CommentOnForum: React.FC<ForumCommentProps> = (props) => {
  const [editing, setEditing] = useState(false);
  const utils = api.useUtils();

  const editComment = api.comments.editForumComment.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.comments.getForumComments.invalidate();
        setEditing(false);
      }
    },
  });

  const deleteComment = api.comments.deleteForumComment.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.comments.getForumComments.invalidate();
        setEditing(false);
      }
    },
  });

  return (
    <BaseComment
      {...props}
      system="forum_comment"
      editComment={editComment.mutate}
      deleteComment={deleteComment.mutate}
      editing={editing}
      setEditing={setEditing}
    />
  );
};

/**
/**
 * Base component on which other comment components are built
 * @param props
 * @returns
 */
interface BaseCommentProps extends PostProps {
  comment: UserReportComment | ForumPost | ConversationComment;
  editing: boolean;
  system?: (typeof systems)[number];
  quoteIds?: string[] | null;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
  editComment?: (data: MutateCommentSchema) => void;
  deleteComment?: (data: DeleteCommentSchema) => void;
  toggleReaction?: (emoji: string) => void;
  setQuoteId?: (id: string) => void;
}
const BaseComment: React.FC<BaseCommentProps> = (props) => {
  // State// Reference for emoji element
  const { data: userData } = useUserData();
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Handle submit
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<MutateCommentSchema>({
    defaultValues: {
      object_id: props.comment.id,
      comment: props.comment.content,
    },
    resolver: zodResolver(mutateCommentSchema),
  });

  const onSubmit = handleSubmit((data) => {
    if (props.editComment) props.editComment(data);
    props.setEditing(false);
  });

  // Derived
  const isAuthor = props.user && userData?.userId === props.user.userId;
  const reactions = [];
  if ("reactions" in props.comment && props.comment.reactions) {
    for (const [reaction, users] of Object.entries(props.comment.reactions)) {
      reactions.push(
        <div
          key={`${props.comment.id}-${reaction}`}
          className="border-2 bg-poppopover rounded-md px-1 hover:bg-poppopover/80 cursor-pointer"
          onClick={() => {
            props.toggleReaction?.(reaction);
          }}
        >
          {reaction} {users.length}
        </div>,
      );
    }
  }

  // Handler for clicks outside emoji selector
  const handleOutsideClick = (e: MouseEvent) => {
    if (emojiRef.current && !emojiRef.current.contains(e.target as HTMLElement)) {
      setEmojiOpen(false);
    }
  };
  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  });

  return (
    <Post
      options={
        props.user && (
          <div className="flex flex-row gap-1">
            {props.toggleReaction && (
              <>
                <SmilePlus
                  className="h-6 w-6 hover:text-orange-500 cursor-pointer"
                  onClick={() => setEmojiOpen(!emojiOpen)}
                />
                <div className="z-50 absolute top-0 right-2" ref={emojiRef}>
                  <EmojiPicker
                    open={emojiOpen}
                    lazyLoadEmojis={true}
                    reactionsDefaultOpen={true}
                    style={
                      {
                        "--epr-emoji-gap": "2px",
                        "--epr-emoji-size": "16px",
                      } as React.CSSProperties
                    }
                    onEmojiClick={(emojiData) => {
                      props.toggleReaction?.(emojiData.emoji);
                    }}
                  />
                </div>
              </>
            )}
            {props.setQuoteId && (
              <Quote
                className={cn(
                  "h-6 w-6",
                  props.quoteIds?.includes(props.comment.id)
                    ? "fill-orange-500"
                    : "hover:text-orange-500",
                )}
                onClick={() => {
                  if (props.setQuoteId && props.comment.id) {
                    props.setQuoteId(props.comment.id);
                  }
                }}
              />
            )}
            {isAuthor && props.editComment && (
              <SquarePen
                className={cn(
                  "h-6 w-6",
                  props.editing ? "fill-orange-500" : "hover:text-orange-500",
                )}
                onClick={() => props.setEditing((prev) => !prev)}
              />
            )}
            {userData && (isAuthor || canSeeSecretData(userData.role)) && (
              <ModerationSummary
                userId={props.user.userId}
                trigger={
                  <BarChart2 className="h-6 w-6 hover:text-orange-500 cursor-pointer" />
                }
              />
            )}
            {props.system && !props.comment?.isReported && (
              <ReportUser
                user={props.user}
                content={props.comment}
                system={props.system}
                button={<Flag className="h-6 w-6 hover:text-orange-500" />}
              />
            )}
            {props.system && props.comment?.isReported && (
              <Flag className="h-6 w-6 fill-orange-500" />
            )}
            {userData &&
              canDeleteComment(userData, props.user.userId) &&
              props.deleteComment && (
                <Confirm
                  title="Confirm Deletion"
                  button={<Trash2 className="h-6 w-6 hover:text-orange-500" />}
                  onAccept={(e) => {
                    e.preventDefault();
                    if (props.deleteComment) {
                      props.deleteComment({ id: props.comment.id });
                    }
                  }}
                >
                  You are about to delete a comment. Are you sure?
                </Confirm>
              )}
          </div>
        )
      }
      {...props}
    >
      {props.editing ? (
        <form onSubmit={onSubmit}>
          <RichInput
            id="comment"
            height="200"
            placeholder={props.comment.content}
            control={control}
            onSubmit={onSubmit}
            error={errors.comment?.message}
          />
        </form>
      ) : (
        <>
          <div className="mb-6">{props.children}</div>
          <p className="absolute bottom-0 right-2 italic text-xs text-gray-600">
            @{props.comment.createdAt.toLocaleString()}
          </p>
          <div className="flex flex-row flex-wrap gap-2">{reactions}</div>
        </>
      )}
    </Post>
  );
};
