import React from "react";
import { api } from "@/utils/api";
import { getUnique } from "@/utils/grouping";
import Loader from "@/layout/Loader";
import GraphUsersGeneric from "@/layout/GraphUsersGeneric";

interface GraphBankLedgerProps {}
const GraphBankLedger: React.FC<GraphBankLedgerProps> = () => {
  // Queries
  const { data, isPending } = api.bank.getGraph.useQuery(undefined, {
    staleTime: Infinity,
  });

  if (!data || isPending) return <Loader explanation="Loading bank ledger graph" />;

  // Wrangling a bit
  const users =
    data
      .flatMap((x) => [
        { id: x.senderId, label: x.senderUsername, img: x.senderAvatar },
        { id: x.receiverId, label: x.receiverUsername, img: x.receiverAvatar },
      ])
      .filter((x) => x) || [];
  const nodes = getUnique(users, "id");
  const edges = data.map((x) => ({
    source: x.senderId,
    target: x.receiverId,
    label: String(x.total),
    weight: x.total > 1 ? Math.log(x.total) : 1,
  }));

  return <GraphUsersGeneric nodes={nodes} edges={edges} hideDefault />;
};

export default GraphBankLedger;
