import { type NextPage } from "next";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import RichInput from "@/layout/RichInput";
import Post from "@/layout/Post";
import AvatarImage from "@/layout/Avatar";
import ReactHtmlParser from "react-html-parser";
import UserSearchSelect from "@/layout/UserSearchSelect";
import { showMutationToast } from "@/libs/toast";
import { getSearchValidator } from "@/validators/register";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { canSubmitNotification } from "@/utils/permissions";
import { mutateContentSchema } from "../validators/comments";
import { useInfinitePagination } from "@/libs/pagination";
import type { z } from "zod";
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
    isPending: isPendingPrevious,
  } = api.misc.getPreviousNotifications.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const notifications = data?.pages.map((page) => page.data).flat();

  // Mutations
  const { mutate, isPending } = api.misc.submitNotification.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
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

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "", users: [] },
  });
  const watchedUsers = userSearchMethods.watch("users", []);
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  useEffect(() => {
    if (userData && userData.username && watchedUsers.length === 0) {
      userSearchMethods.setValue("users", [userData]);
    }
  }, [userData, userSearchMethods, watchedUsers]);

  // Handling submit
  const onSubmit = handleSubmit((data) => {
    if (targetUser) {
      mutate({ ...data, senderId: targetUser.userId });
      reset();
    }
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
          {isPending && <Loader explanation="Submitting notification" />}
          {!isPending && (
            <div className="grid grid-cols-1">
              <form onSubmit={onSubmit}>
                <UserSearchSelect
                  useFormMethods={userSearchMethods}
                  label="Sender (AI, or yourself)"
                  selectedUsers={[]}
                  showYourself={true}
                  inline={true}
                  maxUsers={maxUsers}
                />
                <RichInput
                  id="content"
                  height="200"
                  control={control}
                  onSubmit={onSubmit}
                  error={errors.content?.message}
                />
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
        {isPendingPrevious && <Loader explanation="Submitting notification" />}
        {!isPendingPrevious && (
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
