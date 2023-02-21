import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { TrashIcon } from "@heroicons/react/24/outline";
import Post, { type PostProps } from "./Post";
import RichInput from "./RichInput";
import HiddenField from "./HiddenField";
import SubmitButton from "./SubmitButton";
import Confirm from "../layout/Confirm";
import { type MutateCommentSchema } from "../validators/bugs";
import { mutateCommentSchema } from "../validators/bugs";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";

interface CommentProps extends PostProps {
  comment: {
    id: string;
    content: string;
    user: {
      userId: string;
    };
  };
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

  const methods = useForm<MutateCommentSchema>({
    resolver: zodResolver(mutateCommentSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = methods;
  const onSubmit = handleSubmit((data) => {
    editComment.mutate(data);
    reset();
    setEditing(false);
  });

  return (
    <Post
      options={
        sessionData?.user?.id === props.comment.user.userId && (
          <div className="flex flex-row">
            <PencilSquareIcon
              className={`h-6 w-6 ${
                editing ? "fill-orange-500" : "hover:fill-orange-500"
              }`}
              onClick={() => setEditing((prev) => !prev)}
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
        <FormProvider {...methods}>
          <form onSubmit={onSubmit}>
            <RichInput
              id="comment"
              height="200"
              placeholder={props.comment.content}
              control={control}
              error={errors.comment?.message}
            />
            <HiddenField
              register={register}
              id="object_id"
              value={props.comment.id}
            />
            <SubmitButton id="edit_comment" label="Edit Comment" />
          </form>
        </FormProvider>
      ) : (
        props.children
      )}
    </Post>
  );
};

export default Comment;
