import { type NextPage } from "next";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import Button from "@/layout/Button";
import Loader from "@/layout/Loader";
import RichInput from "@/layout/RichInput";
import Post from "@/layout/Post";
import AvatarImage from "@/layout/Avatar";
import ReactHtmlParser from "react-html-parser";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { canSubmitNotification } from "@/utils/permissions";
import { mutateContentSchema } from "../validators/comments";
import { useInfinitePagination } from "@/libs/pagination";
import type { MutateContentSchema } from "../validators/comments";

const NotifyUsers: NextPage = () => {
  // User state
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Fetch historical notifications
  const {
    data,
    refetch: refetchNotifications,
    fetchNextPage,
    hasNextPage,
    isLoading: isLoadingPrevious,
  } = api.misc.getPreviousNotifications.useInfiniteQuery(
    { limit: 2 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const notifications = data?.pages.map((page) => page.data).flat();

  // Mutations
  const { mutate, isLoading } = api.misc.submitNotification.useMutation({
    onSuccess: async () => {
      await refetchUser();
      await refetchNotifications();
    },
  });

  // Pagination
  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // Form control
  const {
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MutateContentSchema>({
    resolver: zodResolver(mutateContentSchema),
  });

  // Handling submit
  const onSubmit = handleSubmit((data) => {
    mutate(data);
    reset();
  });

  // Show loading indicator when loading user data
  if (!userData) {
    return <Loader explanation="Loading user data" />;
  }

  const canSubmit = canSubmitNotification(userData.role);

  return (
    <>
      {canSubmit && (
        <ContentBox title="Submit New" subtitle="Push notifications to all users">
          {isLoading && <Loader explanation="Submitting notification" />}
          {!isLoading && (
            <div className="grid grid-cols-1">
              <form onSubmit={onSubmit}>
                <RichInput
                  id="content"
                  height="200"
                  control={control}
                  onSubmit={onSubmit}
                  error={errors.content?.message}
                />
                <Button id="create" label="Send Notification" />
              </form>
            </div>
          )}
        </ContentBox>
      )}
      <ContentBox
        title="Notifications"
        subtitle="All Previous Notifications"
        initialBreak={true}
      >
        {isLoadingPrevious && <Loader explanation="Submitting notification" />}
        {!isLoadingPrevious && (
          <div className="grid grid-cols-1">
            {notifications?.map((entry, i) => {
              return (
                <div
                  key={i}
                  ref={i === notifications.length - 1 ? setLastElement : null}
                >
                  <Post align_middle={true}>
                    <div className="flex flex-row">
                      <div className="w-20 grow-0 shrink-0">
                        <AvatarImage
                          href={entry.user.avatar}
                          userId={entry.user.userId}
                          alt={entry.user.username}
                          size={100}
                        />
                      </div>
                      <div className="ml-2">
                        {ReactHtmlParser(entry.content)}
                        <div className="mt-2 italic">
                          By {entry.user.username} on{" "}
                          {entry.createdAt.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </Post>
                </div>
              );
            })}
          </div>
        )}
      </ContentBox>
    </>
  );
};

export default NotifyUsers;
