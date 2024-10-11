"use client";

import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import { canSeeSecretData } from "@/utils/permissions";
import { ExternalLink } from "lucide-react";
import { api } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { showUserRank } from "@/libs/profile";
import { useUserData } from "@/utils/UserContext";
import UserFiltering, { useFiltering, getFilter } from "@/layout/UserFiltering";
import type { ArrayElement } from "@/utils/typeutils";

export default function Users() {
  const { data: userData } = useUserData();
  const tabNames = ["Online", "Strongest", "PvP", "Staff"] as const;
  type TabName = (typeof tabNames)[number];
  const [activeTab, setActiveTab] = useState<TabName>("Online");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Two-level filtering
  const state = useFiltering();

  const {
    data: users,
    fetchNextPage,
    hasNextPage,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    { ...getFilter(state), limit: 30, orderBy: activeTab, isAi: false },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: 1000 * 60 * 5, // every 5min
    },
  );
  const { data: onlineStats } = api.profile.countOnlineUsers.useQuery();
  const userCountNow = onlineStats?.onlineNow || 0;
  const userCountDay = onlineStats?.onlineDay || 0;
  const maxOnline = onlineStats?.maxOnline || 0;
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
  ];
  if (activeTab === "Strongest") {
    columns.push({ key: "experience", header: "Experience", type: "string" });
  } else if (activeTab === "Online") {
    columns.push({ key: "updatedAt", header: "Last Active", type: "time_passed" });
  } else if (activeTab === "Staff") {
    columns.push({ key: "role", header: "Role", type: "capitalized" });
  } else if (activeTab === "PvP") {
    columns.push({ key: "pvpStreak", header: "PvP Streak", type: "string" });
  }
  if (userData && canSeeSecretData(userData.role)) {
    columns.push({ key: "lastIp", header: "LastIP", type: "string" });
  }

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox
      title={`Users`}
      subtitle={`Top ${activeTab}`}
      padding={false}
      topRightContent={
        <div className="flex flex-row items-center gap-2">
          <NavTabs
            id="tab"
            className="text-xs"
            current={activeTab}
            options={tabNames}
            setValue={setActiveTab}
          />
          <UserFiltering state={state} />
        </div>
      }
    >
      <div className="p-2 grid grid-cols-3 text-center">
        <p>
          <b>Online last 5min</b>
          <br /> {userCountNow} users
        </p>
        <p>
          <b>Max Online Ever</b>
          <br />
          {maxOnline} users
        </p>
        <p>
          <b>Online today</b>
          <br /> {userCountDay} users
        </p>
      </div>
      <Table
        data={allUsers}
        columns={columns}
        linkPrefix="/users/"
        linkColumn={"userId"}
        setLastElement={setLastElement}
        buttons={[
          {
            label: <ExternalLink className="h-5 w-5" />,
            onClick: (user: User) => {
              window.open(`/users/${user.userId}`, "_blank");
            },
          },
        ]}
      />
    </ContentBox>
  );
}
