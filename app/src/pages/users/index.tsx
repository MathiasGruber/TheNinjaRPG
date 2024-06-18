import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import Confirm from "@/layout/Confirm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Filter } from "lucide-react";
import { api } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { useUserSearch } from "@/utils/search";
import { showUserRank } from "@/libs/profile";
import type { NextPage } from "next";
import type { ArrayElement } from "@/utils/typeutils";

const Users: NextPage = () => {
  const tabNames = ["Online", "Strongest", "Staff"] as const;
  type TabName = (typeof tabNames)[number];
  const [activeTab, setActiveTab] = useState<TabName>("Online");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { form, searchTerm } = useUserSearch();

  const {
    data: users,
    fetchNextPage,
    hasNextPage,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    {
      limit: 30,
      orderBy: activeTab,
      username: searchTerm,
      isAi: 0,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: 1000 * 60 * 5, // every 5min
    },
  );
  const userCount = api.profile.countOnlineUsers.useQuery().data || 0;
  const allUsers = users?.pages
    .map((page) => page.data)
    .flat()
    .map((user) => ({ ...user, rank: showUserRank(user) }));
  type User = ArrayElement<typeof allUsers>;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  const columns: ColumnDefinitionType<User, keyof User>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "username", header: "Username", type: "string" },
    { key: "rank", header: "Rank", type: "string" },
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
      title={`Users (${userCount} online)`}
      subtitle={`${activeTab} users`}
      padding={false}
      topRightContent={
        <Confirm
          title="Sorting and Filtering"
          button={
            <Button id="create-jutsu">
              <Filter className="sm:mr-2 h-6 w-6 hover:fill-orange-500" />
              <p className="hidden sm:block">Filter</p>
            </Button>
          }
          onAccept={(e) => {
            e.preventDefault();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Form {...form}>
                <Label htmlFor="rank">Username</Label>
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormControl>
                        <Input id="username" placeholder="Search" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </div>
            <div>
              <Label htmlFor="rank">Sorting</Label>
              <Select onValueChange={(e) => setActiveTab(e as TabName)}>
                <SelectTrigger>
                  <SelectValue placeholder={activeTab} />
                </SelectTrigger>
                <SelectContent>
                  {tabNames.map((tab) => (
                    <SelectItem key={tab} value={tab}>
                      {tab}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Confirm>
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
