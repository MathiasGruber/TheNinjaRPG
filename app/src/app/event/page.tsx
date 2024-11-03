"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import RichInput from "@/layout/RichInput";
import Post from "@/layout/Post";
import AvatarImage from "@/layout/Avatar";
import { parseHtml } from "@/utils/parse";
import UserSearchSelect from "@/layout/UserSearchSelect";
import SliderField from "@/layout/SliderField";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { getSearchValidator } from "@/validators/register";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { canSubmitNotification } from "@/utils/permissions";
import { canModifyEventGains } from "@/utils/permissions";
import { mutateContentSchema, type MutateContentSchema } from "@/validators/comments";
import { changeSettingSchema, type ChangeSettingSchema } from "@/validators/misc";
import { useInfinitePagination } from "@/libs/pagination";
import { GAME_SETTING_GAINS_MULTIPLIER } from "@/drizzle/constants";
import { secondsPassed } from "@/utils/time";
import { round } from "@/utils/math";
import type { z } from "zod";

export default function NotifyUsers() {
  return (
    <>
      <RegenGainSystem />
      <TrainingGainSystem />
      <NotificationSystem />
    </>
  );
}

/**
 * Regen Gain System for setting regen multiplier for all users
 */
const RegenGainSystem: React.FC = () => {
  // utils
  const utils = api.useUtils();

  // Query data
  const { data: userData, timeDiff } = useRequiredUserData();
  const { data: setting } = api.misc.getSetting.useQuery(
    { name: "regenGainMultiplier" },
    { enabled: !!userData },
  );

  // Mutate
  const { mutate: setEventGameSetting, isPending } =
    api.misc.setEventGameSetting.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await utils.misc.getSetting.invalidate();
        await utils.profile.getUser.invalidate();
      },
    });

  // Form control
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ChangeSettingSchema>({
    resolver: zodResolver(changeSettingSchema),
  });
  const watchedDays = round(watch("days", 2));

  // When setting loaded, update the slider value
  useEffect(() => {
    if (setting) {
      const daysLeft = secondsPassed(setting.time, timeDiff) / (24 * 3600);
      if (daysLeft < 0) setValue("days", -daysLeft);
    }
  }, [setting, timeDiff, setValue]);

  // Guard
  if (!userData) return null;
  const canChange = canModifyEventGains(userData.role);
  if (!canChange) return null;

  return (
    <ContentBox title="Regen Multiplier" subtitle="Modify regen gains globally">
      {isPending && <Loader explanation="Changing setting" />}
      {!isPending && (
        <div className="grid grid-cols-1">
          <SliderField
            id="days"
            default={0}
            min={0}
            max={31}
            unit="days"
            label="Select duration in days"
            register={register}
            setValue={setValue}
            watchedValue={watchedDays}
            error={errors.days?.message}
          />
          <div className="flex flex-row gap-2">
            {GAME_SETTING_GAINS_MULTIPLIER.map((multiplier, i) => (
              <Button
                id={`multiply-${multiplier}`}
                className={`w-full ${setting?.value === parseInt(multiplier) ? "bg-green-700" : ""}`}
                key={i}
                onClick={() =>
                  setEventGameSetting({
                    setting: "regenGainMultiplier",
                    multiplier,
                    days: watchedDays,
                  })
                }
              >
                {multiplier}X
              </Button>
            ))}
          </div>
        </div>
      )}
    </ContentBox>
  );
};

/**
 * Training Gain System for setting training gains for all users
 */
const TrainingGainSystem: React.FC = () => {
  // utils
  const utils = api.useUtils();

  // Query data
  const { data: userData, timeDiff } = useRequiredUserData();
  const { data: setting } = api.misc.getSetting.useQuery(
    { name: "trainingGainMultiplier" },
    { enabled: !!userData },
  );

  // Mutate
  const { mutate: setEventGameSetting, isPending } =
    api.misc.setEventGameSetting.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await utils.misc.getSetting.invalidate();
        await utils.profile.getUser.invalidate();
      },
    });

  // Form control
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ChangeSettingSchema>({
    resolver: zodResolver(changeSettingSchema),
  });
  const watchedDays = round(watch("days", 2));

  // When setting loaded, update the slider value
  useEffect(() => {
    if (setting) {
      const daysLeft = secondsPassed(setting.time, timeDiff) / (24 * 3600);
      if (daysLeft < 0) setValue("days", -daysLeft);
    }
  }, [setting, timeDiff, setValue]);

  // Guard
  if (!userData) return null;
  const canChange = canModifyEventGains(userData.role);
  if (!canChange) return null;

  return (
    <ContentBox
      title="Training Multiplier"
      subtitle="Modify training gains globally"
      initialBreak={true}
    >
      {isPending && <Loader explanation="Changing setting" />}
      {!isPending && (
        <div className="grid grid-cols-1">
          <SliderField
            id="days"
            default={0}
            min={0}
            max={31}
            unit="days"
            label="Select duration in days"
            register={register}
            setValue={setValue}
            watchedValue={watchedDays}
            error={errors.days?.message}
          />
          <div className="flex flex-row gap-2">
            {GAME_SETTING_GAINS_MULTIPLIER.map((multiplier, i) => (
              <Button
                id={`multiply-${multiplier}`}
                className={`w-full ${setting?.value === parseInt(multiplier) ? "bg-green-700" : ""}`}
                key={i}
                onClick={() =>
                  setEventGameSetting({
                    setting: "trainingGainMultiplier",
                    multiplier,
                    days: watchedDays,
                  })
                }
              >
                {multiplier}X
              </Button>
            ))}
          </div>
        </div>
      )}
    </ContentBox>
  );
};

/**
 * Notification System for sending out messages to all users
 */
const NotificationSystem: React.FC = () => {
  // User state
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { data: userData } = useRequiredUserData();

  // utils
  const utils = api.useUtils();

  // Fetch historical notifications
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isPending: l1,
  } = api.misc.getPreviousNotifications.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );
  const notifications = data?.pages.map((page) => page.data).flat();

  // Mutations
  const { mutate: submitNotification, isPending: l2 } =
    api.misc.submitNotification.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await utils.profile.getUser.invalidate();
        await utils.misc.getPreviousNotifications.invalidate();
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
      submitNotification({ ...data, senderId: targetUser.userId });
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
        <ContentBox
          title="Submit New"
          subtitle="Push notifications to all users"
          initialBreak={true}
        >
          {l2 && <Loader explanation="Submitting notification" />}
          {!l2 && (
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
        {l1 && <Loader explanation="Submitting notification" />}
        {!l1 && (
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
                        {parseHtml(entry.content)}
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
