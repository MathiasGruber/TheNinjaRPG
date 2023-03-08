import { useState } from "react";
import { type NextPage } from "next";

import ContentBox from "../layout/ContentBox";
import Table, { type ColumnDefinitionType } from "../layout/Table";
import NavTabs from "../layout/NavTabs";
import InputField from "../layout/InputField";

import { api } from "../utils/api";
import { useInfinitePagination } from "../libs/pagination";
import { useUserSearch } from "../utils/search";

const Users: NextPage = () => {
  const [activeTab, setActiveTab] = useState<string>("Online");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { register, errors, searchTerm } = useUserSearch();

  const {
    data: users,
    fetchNextPage,
    hasNextPage,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    {
      limit: 10,
      orderBy: activeTab === "Online" ? "updatedAt" : "level",
      username: searchTerm,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allUsers = users?.pages.map((page) => page.data).flat();

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

  type User = ArrayElement<typeof allUsers>;

  const columns: ColumnDefinitionType<User, keyof User>[] = [
    { key: "avatar", header: "", type: "avatar", width: 7 },
    { key: "username", header: "Username", type: "string" },
    { key: "rank", header: "Rank", type: "string" },
  ];

  if (activeTab === "Strongest") {
    columns.push({ key: "level", header: "Lvl.", type: "string" });
  } else if (activeTab === "Online") {
    columns.push({ key: "updatedAt", header: "Last Active", type: "time_passed" });
  }

  return (
    <ContentBox
      title="Users"
      subtitle={`${activeTab} users`}
      padding={false}
      topRightContent={
        <div className="flex flex-col sm:flex-row">
          <InputField
            id="username"
            placeholder="Search"
            register={register}
            error={errors.username?.message}
          />
          <NavTabs
            current={activeTab}
            options={["Online", "Strongest"]}
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
