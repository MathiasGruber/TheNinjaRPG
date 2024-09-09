"use client";

import { useState } from "react";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { api } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import type { ArrayElement } from "@/utils/typeutils";

interface ActionLogsProps {
  table: "ai" | "user" | "jutsu" | "bloodline" | "item" | "badge" | "clan";
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
    { limit: 50, table: props.table, relatedId: props.relatedId },
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
              Changed at: {entry.createdAt.toDateString()} by{" "}
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
      subtitle={`Changes for: ${props.table}`}
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
          linkPrefix="/users/"
          linkColumn={"userId"}
          setLastElement={setLastElement}
        />
      )}
    </ContentBox>
  );
};

export default ActionLogs;
