import { useRouter } from "next/router";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { api } from "../../../utils/api";
import type { NextPage } from "next";

const ItemStatistics: NextPage = () => {
  const router = useRouter();
  const itemId = router.query.itemid as string;

  // Queries
  const { data, isLoading } = api.item.get.useQuery(
    { id: itemId },
    { staleTime: Infinity, enabled: itemId !== undefined }
  );

  // Prevent unauthorized access
  if (isLoading) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <ContentBox
      title="Item Statistics"
      subtitle={data?.name ?? "Loading..."}
      back_href="/manual/items"
    >
      Statistics on Item
    </ContentBox>
  );
};

export default ItemStatistics;
