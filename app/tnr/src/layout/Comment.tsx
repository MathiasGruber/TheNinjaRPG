import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  PencilSquareIcon,
  TrashIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";
import Post, { type PostProps } from "./Post";
import RichInput from "./RichInput";
import SubmitButton from "./SubmitButton";
import Confirm from "../layout/Confirm";
import ReportUser from "../layout/Report";
import { type MutateCommentSchema } from "../validators/bugs";
import { mutateCommentSchema } from "../validators/bugs";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { type BugComment } from "@prisma/client";

interface CommentProps extends PostProps {
  comment: BugComment;
  refetchComments: () => void;
}

const Comment: React.FC<CommentProps> = (props) => {
  const { data: sessionData } = useSession();
  const [editing, setEditing] = useState(false);

  const editComment = api.bugs.editComment.useMutation({
    onSuccess: () => {
      props.refetchComments();
      setEditing(false);
    },
    onError: (error) => {
      show_toast("Error on editing comment", error.message, "error");
    },
  });

  const deleteComment = api.bugs.deleteComment.useMutation({
    onSuccess: () => {
      props.refetchComments();
      setEditing(false);
    },
    onError: (error) => {
      show_toast("Error on deleting comment", error.message, "error");
    },
  });

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
    editComment.mutate(data);
    reset();
    setEditing(false);
  });

  return (
    <Post
      options={
        props.user &&
        sessionData?.user?.id === props.user.userId && (
          <div className="flex flex-row">
            <PencilSquareIcon
              className={`h-6 w-6 ${
                editing ? "fill-orange-500" : "hover:fill-orange-500"
              }`}
              onClick={() => setEditing((prev) => !prev)}
            />
            <ReportUser
              user={props.user}
              content={props.comment}
              system="bug_comment"
              button={<FlagIcon className="h-6 w-6 hover:fill-orange-500" />}
            />
            <Confirm
              title="Confirm Bug Report Deletion"
              button={<TrashIcon className="h-6 w-6 hover:fill-orange-500" />}
              onAccept={(e) => {
                e.preventDefault();
                deleteComment.mutate({ id: props.comment.id });
              }}
            >
              You are about to delete a comment. Are you sure?
            </Confirm>
          </div>
        )
      }
      {...props}
    >
      {editing ? (
        <form onSubmit={onSubmit}>
          <RichInput
            id="comment"
            height="200"
            placeholder={props.comment.content}
            control={control}
            error={errors.comment?.message}
          />
          <SubmitButton id="edit_comment" label="Edit Comment" />
        </form>
      ) : (
        props.children
      )}
    </Post>
  );
};

export default Comment;
