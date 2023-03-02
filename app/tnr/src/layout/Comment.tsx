import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSquareIcon, TrashIcon, FlagIcon } from "@heroicons/react/24/outline";
import Post, { type PostProps } from "./Post";
import RichInput from "./RichInput";
import Button from "./Button";
import Confirm from "../layout/Confirm";
import ReportUser from "../layout/Report";
import { type MutateCommentSchema } from "../validators/comments";
import { type DeleteCommentSchema } from "../validators/comments";
import { mutateCommentSchema } from "../validators/comments";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { type systems } from "../validators/reports";
import { type ForumPost } from "@prisma/client";
import { type BugComment } from "@prisma/client";
import { type UserReportComment } from "@prisma/client";

/**
 * Component for handling comments on user reports
 * @param props
 * @returns
 */
interface UserReportCommentProps extends PostProps {
  comment: UserReportComment;
  refetchComments: () => void;
}
export const CommentOnReport: React.FC<UserReportCommentProps> = (props) => {
  const [editing, setEditing] = useState(false);

  return <BaseComment {...props} editing={editing} setEditing={setEditing} />;
};

/**
 * Component for handling comments on forum threads
 */
interface ForumCommentProps extends PostProps {
  comment: ForumPost;
  refetchComments: () => void;
}
export const CommentOnForum: React.FC<ForumCommentProps> = (props) => {
  const [editing, setEditing] = useState(false);

  const editComment = api.comments.editForumComment.useMutation({
    onSuccess: () => {
      props.refetchComments();
      setEditing(false);
    },
    onError: (error) => {
      show_toast("Error on editing comment", error.message, "error");
    },
  });

  const deleteComment = api.comments.deleteForumComment.useMutation({
    onSuccess: () => {
      props.refetchComments();
      setEditing(false);
    },
    onError: (error) => {
      show_toast("Error on deleting comment", error.message, "error");
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
 * Component for handling comments on bug reports
 * @param props
 * @returns
 */
interface BugCommentProps extends PostProps {
  comment: BugComment;
  refetchComments: () => void;
}
export const CommentOnBug: React.FC<BugCommentProps> = (props) => {
  const [editing, setEditing] = useState(false);

  const editComment = api.comments.editBugComment.useMutation({
    onSuccess: () => {
      props.refetchComments();
      setEditing(false);
    },
    onError: (error) => {
      show_toast("Error on editing comment", error.message, "error");
    },
  });

  const deleteComment = api.comments.deleteBugComment.useMutation({
    onSuccess: () => {
      props.refetchComments();
      setEditing(false);
    },
    onError: (error) => {
      show_toast("Error on deleting comment", error.message, "error");
    },
  });

  return (
    <BaseComment
      {...props}
      system="bug_comment"
      editComment={editComment.mutate}
      deleteComment={deleteComment.mutate}
      editing={editing}
      setEditing={setEditing}
    />
  );
};

/**
 * Base component on which other comment components are built
 * @param props
 * @returns
 */
interface BaseCommentProps extends PostProps {
  comment: BugComment | UserReportComment | ForumPost;
  editing: boolean;
  system?: (typeof systems)[number];
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
  editComment?: (data: MutateCommentSchema) => void;
  deleteComment?: (data: DeleteCommentSchema) => void;
  refetchComments: () => void;
}
const BaseComment: React.FC<BaseCommentProps> = (props) => {
  const { data: sessionData } = useSession();
  const {
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MutateCommentSchema>({
    defaultValues: {
      object_id: props.comment.id,
    },
    resolver: zodResolver(mutateCommentSchema),
  });

  const onSubmit = handleSubmit((data) => {
    props.editComment && props.editComment(data);
    reset();
    props.setEditing(false);
  });

  return (
    <Post
      options={
        props.user &&
        sessionData?.user?.id === props.user.userId && (
          <div className="flex flex-row">
            {props.editComment && (
              <PencilSquareIcon
                className={`h-6 w-6 ${
                  props.editing ? "fill-orange-500" : "hover:fill-orange-500"
                }`}
                onClick={() => props.setEditing((prev) => !prev)}
              />
            )}
            {props.system && (
              <ReportUser
                user={props.user}
                content={props.comment}
                system={props.system}
                button={<FlagIcon className="h-6 w-6 hover:fill-orange-500" />}
              />
            )}
            {props.deleteComment && (
              <Confirm
                title="Confirm Deletion"
                button={<TrashIcon className="h-6 w-6 hover:fill-orange-500" />}
                onAccept={(e) => {
                  e.preventDefault();
                  props.deleteComment && props.deleteComment({ id: props.comment.id });
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
            error={errors.comment?.message}
          />
          <Button id="edit_comment" label="Edit Comment" />
        </form>
      ) : (
        props.children
      )}
    </Post>
  );
};
