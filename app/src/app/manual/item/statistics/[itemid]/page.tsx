"use client";
import { use } from "react";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { UsageStats } from "@/layout/UsageStatistics";
import { itemText } from "@/layout/seoTexts";

export default function ItemStatistics(props: { params: Promise<{ itemid: string }> }) {
  const params = use(props.params);
  const itemId = params.itemid;

  // Queries
  const { data: userData } = useUserData();
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: itemId, type: "item" },
    { enabled: !!itemId },
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
    <>
      {!userData && item && "name" in item && (
        <ContentBox
          title="Jutsu Statistics"
          subtitle={item.name}
          back_href="/manual/jutsu"
        >
          {itemText(item.name)}
        </ContentBox>
      )}
      <ContentBox
        title={`Item: ${name}`}
        subtitle={`#battles: ${total}. #users: ${totalUsers}`}
        initialBreak={!userData && !!item}
        back_href={userData ? "/manual/item" : undefined}
      >
        {usage && <UsageStats usage={usage} />}
      </ContentBox>
    </>
  );
}
