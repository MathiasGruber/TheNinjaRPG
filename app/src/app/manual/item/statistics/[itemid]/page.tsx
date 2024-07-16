"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { UsageStats } from "@/layout/UsageStatistics";

export default function ItemStatistics({ params }: { params: { itemid: string } }) {
  const itemId = params.itemid;

  // Queries
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: itemId, type: "item" },
    { staleTime: Infinity, enabled: itemId !== undefined },
  );
  const item = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = item && "name" in item ? item.name : "";

  // Prevent unauthorized access
  if (isPending) return <Loader explanation="Loading data" />;

  // Show panel controls
  return (
    <ContentBox
      title={`Item: ${name}`}
      subtitle={`#battles: ${total}. #users: ${totalUsers}`}
      back_href="/manual/item"
    >
      {usage && <UsageStats usage={usage} />}
    </ContentBox>
  );
}
