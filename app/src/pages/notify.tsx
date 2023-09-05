import { type NextPage } from "next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import ContentBox from "../layout/ContentBox";
import Button from "../layout/Button";
import Loader from "../layout/Loader";
import RichInput from "../layout/RichInput";
import { api } from "../utils/api";
import { useRequiredUserData } from "../utils/UserContext";
import { canSubmitNotification } from "../utils/permissions";
import { mutateContentSchema } from "../validators/comments";
import type { MutateContentSchema } from "../validators/comments";

const NotifyUsers: NextPage = () => {
  // User state
  const { data: userData, refetch } = useRequiredUserData();

  // Router for forwarding
  const router = useRouter();

  // Mutations
  const { mutate, isLoading } = api.misc.submitNotification.useMutation({
    onSuccess: async () => {
      await refetch();
    },
  });

  // Redirect if no access to this page
  useEffect(() => {
    if (userData && !canSubmitNotification(userData.role)) {
      void router.push("/");
    }
  }, [userData, router]);

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

  return (
    <ContentBox title="Notification" subtitle="Push notifications to all users">
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
  );
};

export default NotifyUsers;
