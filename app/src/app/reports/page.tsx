"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import AvatarImage from "@/layout/Avatar";
import Toggle from "@/components/control/Toggle";
import Post from "@/layout/Post";
import Countdown from "@/layout/Countdown";
import Loader from "@/layout/Loader";
import ParsedReportJson from "@/layout/ReportReason";
import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { reportCommentExplain } from "@/utils/reports";
import { reportCommentColor } from "@/utils/reports";
import { useUserSearch } from "@/utils/search";

export default function Reports() {
  const { data: userData } = useRequiredUserData();

  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [showUnhandled, setShowUnhandled] = useState<boolean | undefined>(false);
  const [showAll, setShowAll] = useState<boolean | undefined>(undefined);
  const { form, searchTerm } = useUserSearch();

  const {
    data: reports,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.reports.getAll.useInfiniteQuery(
    {
      isUnhandled: showUnhandled,
      showAll: showAll,
      ...(searchTerm ? { username: searchTerm } : {}),
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
      enabled: userData !== undefined,
    },
  );
  const allReports = reports?.pages.map((page) => page.data).flat();

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // If this is a user, do not show unhandled reports
  const isUser = userData?.role === "USER";
  useEffect(() => {
    if (isUser) {
      setShowUnhandled(false);
    }
  }, [isUser]);

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox
      title="Reports"
      subtitle={userData?.role === "USER" ? "Your reports" : "Overview"}
      topRightContent={
        <div>
          <div className="flex flex-col items-start">
            {userData?.role !== "USER" && (
              <div className="w-full flex flex-row items-center gap-1">
                <Form {...form}>
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormControl>
                          <Input placeholder="Search user" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Form>
                <Link href="/reports/statistics">
                  <Button id="report-statistics">
                    <Presentation className="h-6 w-6" />
                  </Button>
                </Link>
              </div>
            )}
            <div className="pb-2"></div>
            <div className="w-full flex flex-row pb-2 m-1 gap-2">
              {!isUser && (
                <Toggle
                  id="toggle-report-handled"
                  value={showUnhandled}
                  setShowActive={setShowUnhandled}
                />
              )}
              {!showUnhandled && (
                <Toggle
                  id="toggle-report-all"
                  value={showAll}
                  setShowActive={setShowAll}
                  labelActive="All"
                  labelInactive="Ban/Warning"
                />
              )}
            </div>
          </div>
        </div>
      }
    >
      {isFetching ? (
        <Loader explanation="Fetching Results..." />
      ) : (
        <div>
          {allReports?.length === 0 && <p>No reports found</p>}
          {allReports?.flatMap((entry, i) => {
            const report = entry.UserReport;
            const reportedUser = entry.reportedUser;
            return (
              reportedUser && (
                <div
                  key={report.id}
                  ref={i === allReports.length - 1 ? setLastElement : null}
                >
                  <Link href={"/reports/" + report.id}>
                    <Post
                      title={reportCommentExplain(report.status)}
                      color={reportCommentColor(report.status)}
                      image={
                        <div className="... mr-3 basis-2/12 truncate text-center sm:basis-3/12 sm:text-base">
                          <AvatarImage
                            href={reportedUser.avatar}
                            userId={reportedUser.userId}
                            alt={reportedUser.username}
                            size={100}
                          />
                        </div>
                      }
                      hover_effect={true}
                    >
                      {report.banEnd && (
                        <div className="mb-3">
                          <b>Ban countdown:</b> <Countdown targetDate={report.banEnd} />
                          <hr />
                        </div>
                      )}
                      <ParsedReportJson report={report} />
                    </Post>
                  </Link>
                </div>
              )
            );
          })}
        </div>
      )}
    </ContentBox>
  );
}
