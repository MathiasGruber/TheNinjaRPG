"use client";

import { useState, useEffect, use } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseHtml } from "@/utils/parse";
import Link from "next/link";
import Loader from "@/layout/Loader";
import Pagination from "@/layout/Pagination";
import ContentBox from "@/layout/ContentBox";
import RichInput from "@/layout/RichInput";
import { CommentOnForum } from "@/layout/Comment";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { mutateCommentSchema } from "@/validators/comments";
import { type MutateCommentSchema } from "@/validators/comments";

export default function Thread(props: { params: Promise<{ threadid: string }> }) {
  const params = use(props.params);
  const limit = 10;
  const { data: userData } = useUserData();
  const [page, setPage] = useState(0);
  const thread_id = params.threadid;

  const { data: comments, refetch } = api.comments.getForumComments.useQuery(
    { thread_id: thread_id, limit: limit, cursor: page },
    {
      enabled: !!thread_id,
      placeholderData: (previousData) => previousData,
    },
  );
  const thread = comments?.thread;
  const allComments = comments?.data;
  const totalPages = comments?.totalPages ?? 0;
  const totalComments = comments?.totalComments ?? 0;

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
    if (thread) {
      setValue("object_id", thread.id);
    }
  }, [thread, setValue]);

  const { mutate: createComment, isPending } =
    api.comments.createForumComment.useMutation({
      onSuccess: async () => {
        reset();
        if (totalComments && totalPages && allComments) {
          const newPage = totalComments % limit === 0 ? totalPages : totalPages - 1;
          if (newPage !== page) {
            setPage(newPage);
          }
          await refetch();
        }
      },
    });

  const handleSubmitComment = handleSubmit(
    (data) => createComment(data),
    (errors) => console.error(errors),
  );

  if (!thread) return <Loader explanation="Loading..."></Loader>;

  return (
    <>
      {!userData && (
        <ContentBox title="Public Forum" back_href={"/forum/" + thread.boardId}>
          <p>
            Register an account to also dive into the world of{" "}
            <strong>The Ninja RPG</strong> on our forum. This is the place to connect
            with fellow players, share your strategies, ask questions, and explore the
            rich lore of the ninja world. Whether you&apos;re here to discuss game
            mechanics, brainstorm new tactics, or simply enjoy the camaraderie of our
            passionate community, this thread is your gateway to valuable insights and
            collaboration.
          </p>
          <p className="pt-2">
            Have questions about missions, combat strategies, or character builds? Share
            them here and get advice from experienced players. Looking to understand the
            intricacies of ninja ranks, clan dynamics, or crafting systems? The threads
            found on the forum is a treasure trove of tips and tricks that will help you
            level up your gameplay and enhance your ninja journey.
          </p>
          <p className="pt-2">
            Don&apos;t forget to check out the{" "}
            <Link className="font-bold" href="/manual">
              game manual
            </Link>{" "}
            for detailed guides and instructions on mastering every aspect of{" "}
            <strong>The Ninja RPG</strong>. Stay connected with our vibrant{" "}
            <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
              Discord community
            </Link>{" "}
            for real-time discussions, announcements, and exclusive events. For the
            latest updates and contributions, visit our{" "}
            <Link
              className="font-bold"
              href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
            >
              GitHub repository
            </Link>
            , where you can explore the game&apos;s development and even participate in
            shaping its future. And, of course, make sure to explore other threads in
            the{" "}
            <Link className="font-bold" href="/forum">
              forums
            </Link>{" "}
            to uncover even more tips, debates, and strategies.
          </p>
          <p className="pt-2">
            This forum thread is part of the thriving community that makes{" "}
            <strong>The Ninja RPG</strong> special. Whether you&apos;re a seasoned ninja
            or just starting your journey, you&apos;ll find this thread to be a
            welcoming and resourceful space. Share your ideas, learn from others, and
            contribute to the growing knowledge base of our ninja world.
          </p>
          <p className="pt-2">
            Ready to jump into the discussion? Join the conversation below and
            let&apos;s keep building the ninja legacy together. Haven&apos;t started
            your adventure yet?{" "}
            <Link className="font-bold" href="/login">
              sign up today
            </Link>{" "}
            at <strong>theninja-rpg.com</strong> and become part of the most immersive
            ninja RPG experience online!
          </p>
        </ContentBox>
      )}
      <ContentBox
        title="Forum"
        back_href={userData ? "/forum/" + thread.boardId : undefined}
        initialBreak={userData ? false : true}
        subtitle={thread.title}
      >
        {allComments?.map((comment, i) => {
          return (
            <div key={comment.id}>
              <CommentOnForum
                title={i === 0 && page === 0 ? thread.title : undefined}
                user={comment.user}
                hover_effect={false}
                comment={comment}
              >
                {parseHtml(comment.content)}
              </CommentOnForum>
            </div>
          );
        })}
        {thread &&
          userData &&
          !thread.isLocked &&
          !userData.isBanned &&
          !userData.isSilenced && (
            <div className="mb-3 relative">
              <RichInput
                id="comment"
                height="200"
                refreshKey={totalComments}
                placeholder=""
                control={control}
                disabled={isPending}
                error={errors.comment?.message}
                onSubmit={handleSubmitComment}
              />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-row-reverse">
                {isPending && <Loader />}
              </div>
            </div>
          )}
      </ContentBox>
      {totalPages && <Pagination current={page} total={totalPages} setPage={setPage} />}
    </>
  );
}
