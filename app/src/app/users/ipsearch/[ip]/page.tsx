"use client";

import { useState, use } from "react";
import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import Loader from "@/layout/Loader";
import { ExternalLink } from "lucide-react";
import { api } from "@/app/_trpc/client";
import { useInfinitePagination } from "@/libs/pagination";
import { showUserRank } from "@/libs/profile";
import { useUserData } from "@/utils/UserContext";
import type { ArrayElement } from "@/utils/typeutils";

export default function PublicProfile(props: { params: Promise<{ ip: string }> }) {
  const params = use(props.params);
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  const {
    data: users,
    fetchNextPage,
    hasNextPage,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    {
      limit: 30,
      orderBy: "Online",
      ip: params.ip,
      isAi: false,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: 1000 * 60 * 5, // every 5min
    },
  );
  const allUsers = users?.pages
    .map((page) => page.data)
    .flat()
    .map((user) => ({
      ...user,
      info: (
        <div>
          <p className="font-bold">{user.username}</p>
          <p>
            Lvl. {user.level} {showUserRank(user)}
          </p>
          <p>{user.village?.name || "Syndicate"}</p>
        </div>
      ),
    }));
  type User = ArrayElement<typeof allUsers>;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const columns: ColumnDefinitionType<User, keyof User>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "info", header: "Info", type: "jsx" },
    { key: "updatedAt", header: "Last Active", type: "time_passed" },
    { key: "lastIp", header: "LastIP", type: "string" },
  ];

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox
      title={`Users`}
      back_href="/users"
      subtitle={`IP Lookup: ${params.ip}`}
      padding={false}
    >
      <Table
        data={allUsers}
        columns={columns}
        linkPrefix="/username/"
        linkColumn={"username"}
        setLastElement={setLastElement}
        buttons={[
          {
            label: <ExternalLink className="h-5 w-5" />,
            onClick: (user: User) => {
              window.open(`/userid/${user.userId}`, "_blank");
            },
          },
        ]}
      />
    </ContentBox>
  );
}
