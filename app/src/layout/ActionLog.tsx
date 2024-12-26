"use client";

import { useState } from "react";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { api } from "@/app/_trpc/client";
import { useInfinitePagination } from "@/libs/pagination";
import type { ArrayElement } from "@/utils/typeutils";
import type { ActionLogSchema } from "@/validators/logs";

interface ActionLogsProps {
  state: ActionLogSchema;
  back_href?: string;
  relatedId?: string;
  initialBreak?: boolean;
  topRightContent?: React.ReactNode;
}

const ActionLogs: React.FC<ActionLogsProps> = (props) => {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Query
  const {
    data: entries,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = api.logs.getContentChanges.useInfiniteQuery(
    { limit: 50, relatedId: props.relatedId, ...props.state },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 1000 * 60 * 5, // every 5min
    },
  );
  const allEntries = entries?.pages
    .map((page) => page.data)
    .flat()
    .map((entry) => {
      return {
        ...entry,
        changes: (
          <div>
            <h3>{entry.relatedMsg}</h3>
            {entry.changes.map((change, i) => {
              return <li key={i}>{change}</li>;
            })}
            <p className="italic font-bold mt-2">
              Changed at: {entry.createdAt.toLocaleString()} by{" "}
              {entry.user?.username ?? "Unknown"}
            </p>
          </div>
        ),
      };
    });

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // Table definitions
  type Entry = ArrayElement<typeof allEntries>;
  const columns: ColumnDefinitionType<Entry, keyof Entry>[] = [
    { key: "relatedImage", header: "", type: "avatar" },
    { key: "changes", header: "Changes", type: "string" },
  ];

  return (
    <ContentBox
      title="Content Log"
      subtitle={`Changes for: ${props.state.logtype}`}
      padding={false}
      back_href={props.back_href}
      initialBreak={props.initialBreak}
      topRightContent={props.topRightContent}
    >
      {isFetching && <Loader explanation="Loading data" />}
      {!isFetching && (
        <Table
          data={allEntries}
          columns={columns}
          linkPrefix="/userid/"
          linkColumn={"userId"}
          setLastElement={setLastElement}
        />
      )}
    </ContentBox>
  );
};

export default ActionLogs;
