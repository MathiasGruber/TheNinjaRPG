import { useState } from "react";
import { type NextPage } from "next";

import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";

import { api } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { type ArrayElement } from "@/utils/typeutils";

const Users: NextPage = () => {
  const tabNames = ["ai", "user", "jutsu", "bloodline", "item", "badge"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabNames)[number]>("ai");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  const {
    data: entries,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = api.logs.getContentChanges.useInfiniteQuery(
    { limit: 30, table: activeTab },
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
            {(entry.changes as string[]).map((change, i) => {
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

  /**;; */
  type Entry = ArrayElement<typeof allEntries>;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const columns: ColumnDefinitionType<Entry, keyof Entry>[] = [
    { key: "relatedImage", header: "", type: "avatar" },
    { key: "changes", header: "Changes", type: "string" },
  ];

  return (
    <ContentBox
      title="Content Log"
      subtitle={`Changes for: ${activeTab}`}
      padding={false}
      back_href="/manual"
      topRightContent={
        <div className="flex flex-col sm:flex-row">
          {isFetching && <Loader />}
          <NavTabs
            current={activeTab}
            options={Object.values(tabNames)}
            setValue={setActiveTab}
          />
        </div>
      }
    >
      <Table
        data={allEntries}
        columns={columns}
        linkPrefix="/users/"
        linkColumn={"userId"}
        setLastElement={setLastElement}
      />
    </ContentBox>
  );
};

export default Users;
