import { useRouter } from "next/router";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { api } from "@/utils/api";
import { UsageStats } from "../../../layout/UsageStatistics";
import type { NextPage } from "next";

const ItemStatistics: NextPage = () => {
  const router = useRouter();
  const itemId = router.query.itemid as string;

  // Queries
  const { data, isLoading } = api.data.getStatistics.useQuery(
    { id: itemId, type: "item" },
    { staleTime: Infinity, enabled: itemId !== undefined },
  );
  const item = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = item && "name" in item ? item.name : "";

  // Prevent unauthorized access
  if (isLoading) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <ContentBox
      title={`Item: ${name}`}
      subtitle={`#battles: ${total}. #users: ${totalUsers}`}
      back_href="/manual/items"
    >
      {usage && <UsageStats usage={usage} />}
    </ContentBox>
  );
};

export default ItemStatistics;
