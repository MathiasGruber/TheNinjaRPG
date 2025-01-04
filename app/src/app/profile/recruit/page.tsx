"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type LinkPromotionInput,
  type LinkPromotionReviewInput,
  linkPromotionSchema,
  linkPromotionReviewSchema,
} from "@/validators/linkPromotion";
import AvatarImage from "@/layout/Avatar";
import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import Loader from "@/layout/Loader";
import { ClipboardCopy } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import Confirm from "@/layout/Confirm";
import { canReviewLinkPromotions } from "@/utils/permissions";
import type { ArrayElement } from "@/utils/typeutils";

export default function Recruit() {
  // State
  const { data: userData } = useRequiredUserData();
  const [copied, setCopied] = useState<boolean>(false);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Forms
  const linkForm = useForm<LinkPromotionInput>({
    resolver: zodResolver(linkPromotionSchema),
    defaultValues: {
      url: "",
    },
  });
  const reviewForm = useForm<LinkPromotionReviewInput>({
    resolver: zodResolver(linkPromotionReviewSchema),
    defaultValues: { id: "", points: 0 },
  });

  // tRPC utility
  const utils = api.useUtils();

  // Queries
  const {
    data: users,
    fetchNextPage,
    hasNextPage,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    {
      limit: 30,
      orderBy: "Strongest",
      recruiterId: userData?.userId,
    },
    {
      enabled: !!userData?.userId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: 1000 * 60 * 5, // every 5min
    },
  );

  const { data: promotions } = api.linkPromotion.getLinkPromotions.useInfiniteQuery(
    {
      limit: 30,
      userId: userData?.userId || "placeholder",
    },
    {
      enabled: !!userData?.userId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: 1000 * 60 * 5,
    },
  );

  const submitPromotion = api.linkPromotion.submitLinkPromotion.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        linkForm.reset();
        void utils.linkPromotion.getLinkPromotions.invalidate();
      }
    },
  });

  const reviewPromotion = api.linkPromotion.reviewLinkPromotion.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        reviewForm.reset();
        void utils.linkPromotion.getLinkPromotions.invalidate();
      }
    },
  });

  // Infinite pagination
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Loader
  if (!userData) return <Loader explanation="Loading profile page..." />;

  // Process data
  const allUsers = users?.pages.map((page) => page.data).flat() ?? [];
  const rawPromotions = promotions?.pages.map((page) => page.data).flat() ?? [];
  const allPromotions = rawPromotions.map((promotion) => ({
    ...promotion,
    reviewed: promotion.reviewed
      ? promotion.points > 0
        ? "Reviewed"
        : "Rejected"
      : "Pending",
    user: canReviewLinkPromotions(userData?.role) ? (
      <div className="w-20 text-center">
        <AvatarImage
          href={promotion.user.avatar}
          alt={promotion.user.username || "Unknown"}
          size={100}
        />
        <p>{promotion.user.username}</p>
      </div>
    ) : null,
    actions:
      !promotion.reviewed && canReviewLinkPromotions(userData?.role) ? (
        <Confirm
          title="Review Link Promotion"
          button={<Button>Review</Button>}
          proceed_label="Award Points"
          onAccept={() => {
            const values = reviewForm.getValues();
            reviewPromotion.mutate({
              id: promotion.id,
              points: Number(values.points),
            });
          }}
        >
          <Form {...reviewForm}>
            <form className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">URL: {promotion.url}</p>
              <FormField
                control={reviewForm.control}
                name="points"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Points to award (0-100)"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        min={0}
                        max={500}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </Confirm>
      ) : null,
  }));
  type User = ArrayElement<typeof allUsers>;
  type Promotion = ArrayElement<typeof allPromotions>;

  const recruitedColumns: ColumnDefinitionType<User, keyof User>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "username", header: "Username", type: "string" },
    { key: "level", header: "Level", type: "string" },
    { key: "reputationPointsTotal", header: "Reputation Points", type: "string" },
  ];

  const linkColumns: ColumnDefinitionType<Promotion, keyof Promotion>[] = [
    { key: "actions", header: "", type: "jsx" },
    { key: "url", header: "URL", type: "string" },
    { key: "points", header: "Points", type: "string" },
    { key: "reviewed", header: "Status", type: "string" },
  ];

  if (canReviewLinkPromotions(userData?.role)) {
    linkColumns.push({ key: "user", header: "", type: "jsx" });
  }

  const recruitUrl = `https://www.theninja-rpg.com/?ref=${userData.userId}`;

  return (
    <>
      <ContentBox
        title="Recruitment"
        subtitle="Recruit new members to your village"
        back_href="/profile"
      >
        <p className="italic">
          Every new member you recruit for your village will potentially earn you
          rewards. We hope you will help us spread the word of the game and invite your
          friends (or strangers) to join you in your journey. (PS. recruitments during
          alpha & beta versions of the game will still be active in final release)
        </p>
        <ul className="py-2">
          <li className="py-2 px-2">
            <strong>Money</strong> - Each time a recruited user levels up, you will
            receive money in your bank account equal to the level they just reached
            times 10.
          </li>
          <li className="py-2 px-2">
            <strong>Reputation Points</strong> - Every time a recruited user buys
            reputation points, you will also receive an amount of reputation points
            equal to 10% of what they bought.
          </li>
        </ul>
        <div
          className={`w-full bg-card rounded-lg p-4 italic hover:bg-popover text-card-foreground flex flex-row items-center border ${
            !copied ? "cursor-copy" : "cursor-no-drop"
          }`}
          onClick={async () => {
            await navigator.clipboard.writeText(recruitUrl);
            setCopied(true);
          }}
        >
          <p className="grow">{recruitUrl}</p>
          <ClipboardCopy className="h-8 w-8" />
        </div>
      </ContentBox>

      {allUsers && allUsers.length > 0 && (
        <ContentBox
          title="Recruits"
          subtitle="Members recruited by you"
          initialBreak={true}
          padding={false}
        >
          <Table
            data={allUsers}
            columns={recruitedColumns}
            linkPrefix="/username/"
            linkColumn={"username"}
            setLastElement={setLastElement}
          />
        </ContentBox>
      )}

      <ContentBox
        title="Link Promotion Guide"
        subtitle="Maximize your rewards by promoting effectively"
        initialBreak={true}
      >
        <div>
          Share your recruitment link on other websites and social media to earn
          additional reputation points! A high-quality blog post on a high authority
          gaming site can earn you up to 300 reputation points. In addition, for the
          duration of the beta, we will monitor the links performing the best (based on
          below evaluation criteria), and will award <b>a random S-rank bloodline</b> to
          the user who post the best promotion link. Our review system evaluates
          multiple factors to determine the reward amount:
          <div className="bg-card p-4 rounded-lg space-y-1">
            <h3 className="font-semibold">Evaluation Criteria:</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Website reputation and visibility (high-profile gaming sites receive
                better rewards)
              </li>
              <li>Relevance to the gaming community and target audience</li>
              <li>
                Quality and engagement of recruited players (their activity level and
                progression)
              </li>
              <li>Overall presentation and context of your promotion</li>
            </ul>
          </div>
          <div className="bg-card p-4 rounded-lg space-y-1">
            <h3 className="font-semibold">Recommended Promotion Strategies:</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Write detailed blog posts or reviews about your game experience</li>
              <li>
                Share on popular gaming forums (Reddit, GameFAQs, MMORPG.com,
                medium.com, etc.)
              </li>
              <li>Create content on gaming-focused social media channels</li>
              <li>
                Participate in relevant gaming communities and share your experiences
              </li>
              <li>
                <b>Focus on sharing your link in publicly accessible locations</b>
              </li>
              <li className="text-red-500">
                <b>Always follow the rules whereever you decide to promote!</b>
              </li>
            </ul>
          </div>
          <Form {...linkForm}>
            <form
              onSubmit={linkForm.handleSubmit((data) => {
                submitPromotion.mutate(data);
              })}
              className="flex flex-row gap-2 mt-4"
            >
              <FormField
                control={linkForm.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        placeholder="Enter URL where you promoted your link..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={submitPromotion.isPending}>
                Submit
              </Button>
            </form>
          </Form>
        </div>
      </ContentBox>

      {allPromotions.length > 0 && (
        <ContentBox
          title="Link Promotions"
          subtitle={
            canReviewLinkPromotions(userData.role)
              ? "Promotions for Review"
              : "Your submitted promotions"
          }
          initialBreak={true}
          padding={false}
        >
          <Table data={allPromotions} columns={linkColumns} />
        </ContentBox>
      )}
    </>
  );
}
