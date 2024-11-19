"use client";

import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import AvatarImage from "@/layout/Avatar";
import RichInput from "@/layout/RichInput";
import { useUserData } from "@/utils/UserContext";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { useForm } from "react-hook-form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { showMutationToast } from "@/libs/toast";
import { userReviewSchema, type UserReviewSchema } from "@/validators/reports";
import { cn } from "src/libs/shadui";
import { api } from "@/app/_trpc/client";

export default function ManualTravel() {
  // User state
  const { data: userData } = useUserData();

  // Users Query
  const { data, isPending: isLoadingUsers } = api.profile.getPublicUsers.useQuery(
    { orderBy: "Staff", isAi: false, limit: 50 },
    {},
  );
  const users = data?.data || [];

  // Current user reviews
  const { data: userReviews } = api.reports.getUserStaffReviews.useQuery(undefined, {
    enabled: !!userData,
  });

  return (
    <>
      <ContentBox
        title="Opinions"
        subtitle="Let us know that state of affairs"
        back_href="/manual"
      >
        TNR has always been community-driven; it&apos;s been our strength, but it&apos;s
        also been our weakness, with poor trust between users and staff, toxic
        atmosphere, etc. We wish to change that, and it starts with collecting public
        opinions.
      </ContentBox>
      <ContentBox
        title="Review Staff"
        subtitle="Annonymously share your thoughts"
        initialBreak={true}
      >
        <p className="pb-2 italic">
          Only the game owner will be able to see and review these reports. We collect
          this information to improve the game and the community, not to target specific
          staff members. Abuse of this system will be punished severely and is analyzed
          carefully. Only share your honest opinions, both positive and negative.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
          {users.map((user, i) => {
            const review = userReviews?.find((r) => r.targetUserId === user.userId);
            return (
              <ReportImage
                key={`staffreview-${i}`}
                user={user}
                positive={review?.positive}
                review={review?.review}
              />
            );
          })}
        </div>
        {isLoadingUsers && <Loader explanation="Loading staff users" />}
      </ContentBox>
    </>
  );
}

interface ReportimageProps {
  user: {
    userId: string;
    avatar: string | null;
    username: string;
    level: number;
    role: string;
  };
  positive?: boolean;
  review?: string;
}

const ReportImage: React.FC<ReportimageProps> = (props) => {
  // Destructure information
  const { user } = props;

  // Utils
  const utils = api.useUtils();

  // Mutations
  const { mutate: upsertReview, isPending: isCreating } =
    api.reports.upsertStaffReview.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await utils.reports.getUserStaffReviews.invalidate();
      },
    });

  // Form
  const createForm = useForm<UserReviewSchema>({
    resolver: zodResolver(userReviewSchema),
    defaultValues: {
      positive: props.positive,
      review: props.review || "",
      staffUserId: user.userId,
    },
  });
  const watchedPositive = createForm.watch("positive");

  // Form handlers
  const onSubmit = createForm.handleSubmit((data) => {
    // Must submit either positive or negative
    if (data.positive === undefined) {
      showMutationToast({ success: false, message: "Select positive or negative" });
      return;
    }
    upsertReview(data);
  });

  if (isCreating) return <Loader explanation="Creating review" />;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="text-center relative">
          <AvatarImage
            href={user.avatar}
            alt={user.username}
            userId={user.userId}
            hover_effect={true}
            priority={true}
            size={100}
          />
          <div>
            <div className="font-bold">{user.username}</div>
            <div>
              Lvl. {user.level} {capitalizeFirstLetter(user.role)}
            </div>
          </div>
          {props.positive === true && (
            <ThumbsUp
              className={cn("w-6 h-6 fill-orange-500 absolute top-2 right-4")}
            />
          )}
          {props.positive === false && (
            <ThumbsDown
              className={cn("w-6 h-6 fill-orange-500 absolute top-2 right-4")}
            />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent>
        <div className="max-w-[320px] min-w-[320px] relative">
          <div className="flex flex-row gap-2">
            <ThumbsDown
              className={cn(
                "w-6 h-6",
                watchedPositive === false ? "fill-orange-500" : "",
              )}
              onClick={() => createForm.setValue("positive", false)}
            />{" "}
            <ThumbsUp
              className={cn(
                "w-6 h-6",
                watchedPositive === true ? "fill-orange-500" : "",
              )}
              onClick={() => createForm.setValue("positive", true)}
            />{" "}
          </div>
          <Form {...createForm}>
            <form className="space-y-2" onSubmit={onSubmit}>
              <RichInput
                id="review"
                label="Review of this staff member"
                height="300"
                placeholder=""
                control={createForm.control}
                error={createForm.formState.errors.review?.message}
              />
            </form>
            <Button className="w-full mt-2" onClick={onSubmit}>
              Submit
            </Button>
          </Form>
        </div>
      </PopoverContent>
    </Popover>
  );
};
