"use client";

import { useState } from "react";
import { api } from "@/app/_trpc/client";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import AvatarImage from "@/layout/Avatar";
import { useInfinitePagination } from "@/libs/pagination";
import Link from "next/link";
import type { ArrayElement } from "@/utils/typeutils";

export default function AwardsManual() {
  // State for infinite scroll
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Query with pagination
  const { data, fetchNextPage, hasNextPage } = api.misc.getAllAwards.useInfiniteQuery(
    { limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );

  // Setup infinite scroll
  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // Process awards data
  const allAwards = data?.pages
    .map((page) => page.data)
    .flat()
    .map((award) => ({
      ...award,
      awardedBy: (
        <div className="w-20 text-center">
          <Link href={`/userid/${award.awardedBy.userId}`}>
            <AvatarImage
              href={award.awardedBy?.avatar}
              alt={award.awardedBy.username}
              size={100}
            />
            <p>{award.awardedBy.username}</p>
          </Link>
        </div>
      ),
      receiver: (
        <div className="w-20 text-center">
          <Link href={`/userid/${award.receiver.userId}`}>
            <AvatarImage
              href={award.receiver?.avatar}
              alt={award.receiver.username}
              size={100}
            />
            <p>{award.receiver.username}</p>
          </Link>
        </div>
      ),
      rewards: (
        <div>
          {award.reputationAmount > 0 && <p>Reputation: {award.reputationAmount}</p>}
          {award.moneyAmount > 0 && <p>Money: {award.moneyAmount}</p>}
        </div>
      ),
    }));

  // Table configuration
  type AwardWithUsers = ArrayElement<typeof allAwards>;
  const columns: ColumnDefinitionType<AwardWithUsers, keyof AwardWithUsers>[] = [
    { key: "receiver", header: "Awarded To", type: "jsx" },
    { key: "awardedBy", header: "Awarded By", type: "jsx" },
    { key: "rewards", header: "Rewards", type: "jsx" },
    { key: "reason", header: "Reason", type: "string" },
    { key: "createdAt", header: "Date", type: "date" },
  ];

  if (!data) return <Loader explanation="Loading awards data..." />;

  return (
    <ContentBox
      title="User Rewards"
      subtitle="History of all reputation points and money awarded"
      padding={false}
      back_href="/manual"
    >
      {allAwards && allAwards.length > 0 ? (
        <Table data={allAwards} columns={columns} setLastElement={setLastElement} />
      ) : (
        <p className="p-3">No awards found.</p>
      )}
    </ContentBox>
  );
}
