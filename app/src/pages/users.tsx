import { useState } from "react";
import { type NextPage } from "next";

import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import InputField from "@/layout/InputField";

import { api } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { useUserSearch } from "@/utils/search";
import { type ArrayElement } from "@/utils/typeutils";

const Users: NextPage = () => {
  const tabNames = ["Online", "Strongest", "Staff"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabNames)[number]>("Online");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { register, errors, searchTerm } = useUserSearch();

  const {
    data: users,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    {
      limit: 30,
      orderBy: activeTab,
      username: searchTerm,
      isAi: 0,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: 1000 * 60 * 5, // every 5min
    },
  );
  const allUsers = users?.pages.map((page) => page.data).flat();
  type User = ArrayElement<typeof allUsers>;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const columns: ColumnDefinitionType<User, keyof User>[] = [
    { key: "avatar", header: "", type: "avatar", width: 7 },
    { key: "username", header: "Username", type: "string" },
    { key: "rank", header: "Rank", type: "capitalized" },
  ];
  if (activeTab === "Strongest") {
    columns.push({ key: "level", header: "Lvl.", type: "string" });
    columns.push({ key: "experience", header: "Experience", type: "string" });
  } else if (activeTab === "Online") {
    columns.push({ key: "updatedAt", header: "Last Active", type: "time_passed" });
  } else if (activeTab === "Staff") {
    columns.push({ key: "role", header: "Role", type: "capitalized" });
  }

  return (
    <ContentBox
      title="Users"
      subtitle={`${activeTab} users`}
      padding={false}
      topRightContent={
        <div className="flex flex-col sm:flex-row">
          {isFetching && <Loader />}
          <InputField
            id="username"
            placeholder="Search"
            register={register}
            error={errors.username?.message}
          />
          <NavTabs
            current={activeTab}
            options={["Online", "Strongest", "Staff"]}
            setValue={setActiveTab}
          />
        </div>
      }
    >
      <Table
        data={allUsers}
        columns={columns}
        linkPrefix="/users/"
        linkColumn={"userId"}
        setLastElement={setLastElement}
      />
    </ContentBox>
  );
};

export default Users;
