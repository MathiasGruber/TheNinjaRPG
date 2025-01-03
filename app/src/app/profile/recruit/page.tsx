"use client";

import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import Loader from "@/layout/Loader";
import { ClipboardCopy } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import type { ArrayElement } from "@/utils/typeutils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { canReviewLinkPromotions } from "@/utils/permissions";

export default function Recruit() {
  // State
  const { data: userData } = useRequiredUserData();
  const [copied, setCopied] = useState<boolean>(false);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [promotionUrl, setPromotionUrl] = useState<string>("");
  const [reviewPoints, setReviewPoints] = useState<string>("");

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

  const { data: promotions, refetch: refetchPromotions } = api.profile.getLinkPromotions.useInfiniteQuery(
    {
      limit: 30,
      userId: userData?.userId,
    },
    {
      enabled: !!userData?.userId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: 1000 * 60 * 5,
    },
  );

  const submitPromotion = api.profile.submitLinkPromotion.useMutation({
    onSuccess: () => {
      setPromotionUrl("");
      void refetchPromotions();
    },
  });

  const reviewPromotion = api.profile.reviewLinkPromotion.useMutation({
    onSuccess: () => {
      setReviewPoints("");
      void refetchPromotions();
    },
  });

  const allUsers = users?.pages.map((page) => page.data).flat();
  const allPromotions = promotions?.pages.map((page) => page.data).flat() ?? [];
  type User = ArrayElement<typeof allUsers>;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  const columns: ColumnDefinitionType<User, keyof User>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "username", header: "Username", type: "string" },
    { key: "level", header: "Level", type: "string" },
    { key: "reputationPointsTotal", header: "Reputation Points", type: "string" },
  ];

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
          <li className="py-2 px-2">
            <strong>Link Promotion</strong> - Share your recruitment link on other websites
            and social media to earn additional reputation points! Submit the links below
            and our admins will review them. You can earn up to 100 reputation points per
            approved promotion.
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

        <div className="flex flex-row gap-2 mt-4">
          <Input
            placeholder="Enter URL where you promoted your link..."
            value={promotionUrl}
            onChange={(e) => setPromotionUrl(e.target.value)}
          />
          <Button
            onClick={() => {
              if (promotionUrl) {
                submitPromotion.mutate({ url: promotionUrl });
              }
            }}
            disabled={!promotionUrl || submitPromotion.isLoading}
          >
            Submit
          </Button>
        </div>
      </ContentBox>

      {allPromotions.length > 0 && (
        <ContentBox
          title="Link Promotions"
          subtitle="Your submitted promotions"
          initialBreak={true}
          padding={false}
        >
          <Table
            data={allPromotions}
            columns={[
              { key: "url", header: "URL", type: "string" },
              { key: "points", header: "Points", type: "string" },
              { key: "reviewed", header: "Status", type: "string", 
                format: (value) => value ? "Reviewed" : "Pending" },
              { key: "reviewedAt", header: "Reviewed At", type: "string",
                format: (value) => value ? new Date(value).toLocaleDateString() : "-" },
              { key: "actions", header: "", type: "custom",
                render: (row) => !row.reviewed && canReviewLinkPromotions(userData?.role) ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">Review</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Review Link Promotion</DialogTitle>
                      </DialogHeader>
                      <div className="flex flex-col gap-4">
                        <p>URL: {row.url}</p>
                        <div className="flex flex-row gap-2">
                          <Input
                            type="number"
                            placeholder="Points to award (0-100)"
                            value={reviewPoints}
                            onChange={(e) => setReviewPoints(e.target.value)}
                            min="0"
                            max="100"
                          />
                          <Button
                            onClick={() => {
                              const points = parseInt(reviewPoints);
                              if (points >= 0 && points <= 100) {
                                reviewPromotion.mutate({
                                  id: row.id,
                                  points: points,
                                });
                              }
                            }}
                            disabled={!reviewPoints || reviewPromotion.isLoading}
                          >
                            Award Points
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : null
              }
            ]}
          />
        </ContentBox>
      )}

      {allUsers && allUsers.length > 0 && (
        <ContentBox
          title="Recruits"
          subtitle="Members recruited by you"
          initialBreak={true}
          padding={false}
        >
          <Table
            data={allUsers}
            columns={columns}
            linkPrefix="/username/"
            linkColumn={"username"}
            setLastElement={setLastElement}
          />
        </ContentBox>
      )}
    </>
  );
}
